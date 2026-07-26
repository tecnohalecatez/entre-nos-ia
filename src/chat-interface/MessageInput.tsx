// MessageInput: text input component of the Chat_Interface (task 17.3).
// See .kiro/specs/asistente-ia-local/design.md (section "Validador de
// mensajes de entrada") and requirements.md (4.4, 4.6, 4.7, 4.8, 4.9, 8.2).
//
// Responsibility of this component: live validation of the typed content,
// disabling send while the Inference_Engine is generating a response or
// hasn't finished initializing yet, and exposing the cancel-generation and
// retry-after-error actions. The full orchestration of sending (creating a
// Conversation if none exists, invoking `InferenceEngine.generate`,
// persisting messages) is the responsibility of whoever integrates this
// component (task 22.1); here we only notify the intent via `onSend` and
// `onRetry`.
//
// Design decision (cancel, 4.4/4.5): this component invokes
// `inferenceEngine.cancel()` directly (the only action it's responsible
// for: interrupting the in-progress generation), but does NOT itself
// dispatch the `{ type: "cancel" }` event on `dispatchGeneration`. The loop
// that consumes the `AsyncIterable` from `InferenceEngine.generate()`
// (property of task 22.1, where the full send-flow integration lives) is
// the one that detects cancellation while iterating and must dispatch the
// state transition with the actual generated content up to that point.
// Duplicating the dispatch here would risk a race between two `"cancel"`
// dispatches with different captured `partialText`.

import { useId, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { validateMessage } from "../message-validator/validateMessage";
import type { Message } from "../types/models";
import type { GenerationState } from "../inference-engine/reduceGeneration";
import type { InferenceEngine } from "../inference-engine/InferenceEngine";
import "./MessageInput.css";

export interface MessageInputProps {
  /** Current state of the generation cycle (see `reduceGeneration`). */
  generationState: GenerationState;
  /** `true` once `InferenceEngine.initialize()` has resolved successfully. */
  engineReady: boolean;
  /** Instance of the Inference_Engine, used solely to invoke `cancel()`. */
  inferenceEngine: InferenceEngine;
  /**
   * Notifies the intent to send a valid Message. `normalizedContent` is
   * already trimmed of whitespace (see `validateMessage`). Whoever
   * integrates this component (task 22.1) is responsible for creating a
   * Conversation if none exists (4.9) and invoking the Inference_Engine.
   */
  onSend: (normalizedContent: string) => void;
  /**
   * Notifies the intent to retry after a generation error (8.2), passing
   * the same user Message that must be resent.
   */
  onRetry: (userMessage: Message) => void;
}

const PREPARING_MESSAGE = "El asistente aún se está preparando";
const EMPTY_MESSAGE = "El mensaje no puede estar vacío";
const LENGTH_EXCEEDED_MESSAGE = "El mensaje excede la longitud máxima de 4000 caracteres";

/**
 * Chat_Interface's Message input field, with live validation, disabling
 * send during generation/pending initialization, and the
 * cancel-generation/retry-after-error actions.
 */
export function MessageInput({
  generationState,
  engineReady,
  inferenceEngine,
  onSend,
  onRetry,
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const errorId = useId();

  const generating = generationState.type === "generating";
  const inError = generationState.type === "error";

  const validationResult = validateMessage(value);
  const showValidationError = touched && !validationResult.valid;

  const validationErrorMessage = !validationResult.valid
    ? validationResult.reason === "empty"
      ? EMPTY_MESSAGE
      : LENGTH_EXCEEDED_MESSAGE
    : null;

  // Precedence order of disabling reasons (4.4, 4.6, 4.7, 4.8): first the
  // System conditions (generating, engine not ready), then the typed
  // content's validation.
  const disabled = generating || !engineReady || !validationResult.valid;

  function handleChange(newValue: string): void {
    setValue(newValue);
    setTouched(true);
  }

  /**
   * Shared by the form's submit (button click / native Enter on a plain
   * `input`, not applicable here since this is a `textarea`) and by
   * `handleKeyDown`'s Enter-to-send, so both paths go through the exact same
   * validation/disabling guards (4.4, 4.6, 4.7, 4.8) with no duplicated logic.
   */
  function submitMessage(): void {
    setTouched(true);

    if (generating || !engineReady) {
      return;
    }

    const result = validateMessage(value);
    if (!result.valid) {
      return;
    }

    onSend(result.normalizedContent);
    setValue("");
    setTouched(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitMessage();
  }

  // Enter sends, Shift+Enter (or Ctrl/Alt/Meta+Enter) inserts a newline.
  // Since the field is a `textarea`, Enter would otherwise just insert a
  // newline and never submit the form -- this restores the behavior users
  // expect from a chat input. Composition (IME) is excluded: while composing
  // an input method's candidate, Enter confirms the candidate and must not
  // send the message.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    submitMessage();
  }

  function handleCancel(): void {
    inferenceEngine.cancel();
  }

  function handleRetry(): void {
    if (generationState.type === "error") {
      onRetry(generationState.userMessage);
    }
  }

  return (
    <form className="message-input" onSubmit={handleSubmit}>
      <label className="message-input__label" htmlFor="message-input-field">
        Mensaje
      </label>
      <textarea
        id="message-input-field"
        className="message-input__field"
        value={value}
        onChange={(event) => {
          handleChange(event.target.value);
        }}
        onBlur={() => {
          setTouched(true);
        }}
        onKeyDown={handleKeyDown}
        aria-describedby={showValidationError || !engineReady ? errorId : undefined}
        aria-invalid={showValidationError}
      />
      <p className="message-input__hint">Enter para enviar · Shift+Enter para nueva línea</p>
      <div
        id={errorId}
        className={`message-input__status-message${showValidationError ? " message-input__status-message--error" : ""}`}
        role="status"
      >
        {!engineReady
          ? PREPARING_MESSAGE
          : showValidationError
            ? validationErrorMessage
            : null}
      </div>
      <div className="message-input__actions">
        {generating ? (
          <button type="button" className="button button--ghost" onClick={handleCancel}>
            Cancelar
          </button>
        ) : null}
        {inError ? (
          <button type="button" className="button button--secondary" onClick={handleRetry}>
            Reintentar
          </button>
        ) : null}
        <button type="submit" className="button button--primary" disabled={disabled}>
          Enviar
        </button>
      </div>
    </form>
  );
}
