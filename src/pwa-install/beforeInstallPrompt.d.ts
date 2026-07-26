// Minimal ambient declarations for the `beforeinstallprompt` and
// `appinstalled` events, absent from TypeScript's default DOM types (same
// pattern as `src/compatibility-detector/experimental-navigator.d.ts`). See
// .kiro/specs/asistente-ia-local/design.md (section "Instalabilidad") and
// requirements.md (Requirement 11: 11.2, 11.3, 11.6).

/**
 * Non-standard event emitted by supporting browsers (e.g. Chrome/Edge) when
 * they determine the PWA's installability criteria are met. Capturing it and
 * calling `preventDefault()` allows deferring the browser's native prompt to
 * show it via a custom control instead (11.2).
 */
interface BeforeInstallPromptEvent extends Event {
  // Declared as function-typed properties (instead of shorthand methods
  // like `prompt(): ...`) so that referencing them as values (e.g. in a
  // test spy) does not trigger the `@typescript-eslint/unbound-method`
  // rule, since they do not depend on `this`.
  /** Invokes the browser's native install prompt (11.3). */
  readonly prompt: () => Promise<void>;
  /** Resolves once the user accepts or dismisses the native prompt (11.3). */
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
  /** Emitted by the browser when installation completed successfully. */
  appinstalled: Event;
}
