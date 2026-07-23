// Unit tests for `MessageInput` (task 17.3).
// See .kiro/specs/asistente-ia-local/requirements.md (4.4, 4.6, 4.7, 4.8, 4.9, 8.2).

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageInput } from "./MessageInput";
import type { GenerationState } from "../inference-engine/reduceGeneration";
import type { InferenceEngine } from "../inference-engine/InferenceEngine";
import type { Message } from "../types/models";

function createInferenceEngineStub() {
  const cancel = vi.fn();
  const inferenceEngine: InferenceEngine = {
    initialize: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn(),
    cancel,
  };
  return { inferenceEngine, cancel };
}

const IDLE_STATE: GenerationState = { type: "idle" };

const USER_MESSAGE: Message = {
  id: "message-1",
  role: "user",
  content: "hola",
  timestamp: 1000,
};

function renderComponent(
  props: Partial<Parameters<typeof MessageInput>[0]> = {},
) {
  const { inferenceEngine, cancel } = createInferenceEngineStub();
  const onSend = vi.fn();
  const onRetry = vi.fn();

  const utils = render(
    <MessageInput
      generationState={IDLE_STATE}
      engineReady={true}
      inferenceEngine={inferenceEngine}
      onSend={onSend}
      onRetry={onRetry}
      {...props}
    />,
  );

  return { ...utils, inferenceEngine, cancel, onSend, onRetry };
}

function getSendButton(): HTMLElement {
  return screen.getByRole("button", { name: "Enviar" });
}

function getField(): HTMLElement {
  return screen.getByLabelText("Mensaje");
}

describe("MessageInput", () => {
  it("shows the 'empty' validation state and disables send when typing only spaces (4.6)", async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.type(getField(), "   ");

    expect(screen.getByText("El mensaje no puede estar vacío")).toBeInTheDocument();
    expect(getSendButton()).toBeDisabled();
  });

  it("shows the 'length exceeded' validation state and disables send when exceeding 4000 characters (4.8)", async () => {
    const user = userEvent.setup();
    renderComponent();

    const longText = "a".repeat(4001);
    await user.click(getField());
    await user.paste(longText);

    expect(
      screen.getByText("El mensaje excede la longitud máxima de 4000 caracteres"),
    ).toBeInTheDocument();
    expect(getSendButton()).toBeDisabled();
  });

  it("enables send with valid content and calls onSend with the trimmed content when sending", async () => {
    const user = userEvent.setup();
    const { onSend } = renderComponent();

    await user.click(getField());
    await user.paste("  hola mundo  ");
    expect(getSendButton()).toBeEnabled();

    await user.click(getSendButton());

    expect(onSend).toHaveBeenCalledWith("hola mundo");
    expect(getField()).toHaveValue("");
  });

  it("disables send while generationState.type === 'generating' (4.4)", async () => {
    const user = userEvent.setup();
    const generatingState: GenerationState = {
      type: "generating",
      userMessage: USER_MESSAGE,
      partialText: "",
    };
    renderComponent({ generationState: generatingState });

    await user.type(getField(), "otro mensaje");

    expect(getSendButton()).toBeDisabled();
  });

  it("disables send and shows the preparing message while engineReady is false (4.7)", async () => {
    const user = userEvent.setup();
    renderComponent({ engineReady: false });

    await user.type(getField(), "mensaje válido");

    expect(screen.getByText("El asistente aún se está preparando")).toBeInTheDocument();
    expect(getSendButton()).toBeDisabled();
  });

  it("shows the Cancel button only while generating and calls inferenceEngine.cancel()", async () => {
    const user = userEvent.setup();
    const generatingState: GenerationState = {
      type: "generating",
      userMessage: USER_MESSAGE,
      partialText: "parcial",
    };
    const { inferenceEngine, cancel, rerender } = renderComponent({ generationState: generatingState });

    const cancelButton = screen.getByRole("button", { name: "Cancelar" });
    await user.click(cancelButton);
    expect(cancel).toHaveBeenCalledOnce();

    rerender(
      <MessageInput
        generationState={IDLE_STATE}
        engineReady={true}
        inferenceEngine={inferenceEngine}
        onSend={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
  });

  it("shows the Retry button only in the error state and calls onRetry with the user message (8.2)", async () => {
    const user = userEvent.setup();
    const errorState: GenerationState = {
      type: "error",
      userMessage: USER_MESSAGE,
      error: "fallo de generación",
    };
    const { onRetry } = renderComponent({ generationState: errorState });

    const retryButton = screen.getByRole("button", { name: "Reintentar" });
    await user.click(retryButton);

    expect(onRetry).toHaveBeenCalledWith(USER_MESSAGE);
  });

  it("does not show the Retry button outside the error state", () => {
    renderComponent({ generationState: IDLE_STATE });

    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });
});
