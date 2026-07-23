// Integration tests for the Service_Worker_App lifecycle.
//
// `sw.ts` (the Service Worker itself) cannot run in a real Service Worker
// context inside Vitest/happy-dom, so these tests cover:
//
// 1. Registration and fallback to direct network on registration/caching
//    failure (3.1, 3.2, 3.3), exercising `registerServiceWorker()` with the
//    virtual module `virtual:pwa-register` substituted via `vi.mock` (see
//    `vitest.config.ts`, which aliases the specifier to a resolvable stub
//    and allows `vi.mock` to intercept it).
// 2. The offline-access-blocking contract with no prior cache (3.5): the
//    decision logic is already covered exhaustively at the pure-function
//    level by `decideResponseSource.property.test.ts` (Property 4); here we
//    verify the contract that a future UI/bootstrap layer (tasks 16.1/22.2)
//    will use to block access.
// 3. The integration of `registerServiceWorker()` (the real `SendSkipWaiting`
//    it returns) with `createUpdateController()`: deferred reload during an
//    active generation and applied once it finishes (9.4, 9.5), and
//    notification dismissal without interruption (9.6). The controller's
//    decision logic detail is already covered exhaustively in
//    `serviceWorkerUpdateController.test.ts`; here both modules are tested
//    wired together end-to-end instead of with a bare mock.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegisterSWOptions } from "vite-plugin-pwa/types";
import type { GenerationState } from "../inference-engine/reduceGeneration";
import { createUpdateController } from "./serviceWorkerUpdateController";
import { decideResponseSource } from "./decideResponseSource";

const registerSWMock =
  vi.fn<(options?: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>>();

vi.mock("virtual:pwa-register", () => ({
  registerSW: (options?: RegisterSWOptions): ((reloadPage?: boolean) => Promise<void>) =>
    registerSWMock(options),
}));

const userMessage = {
  id: "msg-1",
  role: "user" as const,
  content: "hola",
  timestamp: 0,
};

const idleState: GenerationState = { type: "idle" };
const generatingState: GenerationState = {
  type: "generating",
  userMessage,
  partialText: "...",
};
const completedState: GenerationState = {
  type: "completed",
  userMessage,
  assistantMessage: { ...userMessage, id: "msg-2", role: "assistant" },
};

/** Asserts that `value` is defined and returns it without using `!` (non-null assertion). */
function assumeDefined<T>(value: T | undefined): T {
  expect(value).toBeDefined();
  if (value === undefined) {
    throw new Error("Expected a defined value");
  }
  return value;
}

describe("registerServiceWorker — successful registration and fallback to direct network (3.1, 3.2, 3.3)", () => {
  const originalServiceWorker = (
    navigator as unknown as { serviceWorker?: unknown }
  ).serviceWorker;

  afterEach(() => {
    registerSWMock.mockReset();
    Object.defineProperty(navigator, "serviceWorker", {
      value: originalServiceWorker,
      configurable: true,
    });
  });

  it("reports the failure via onRegistrationFailed and returns undefined if the browser does not support Service Worker (3.3)", async () => {
    // "serviceWorker" in navigator must be false: the property is deleted
    // instead of set to undefined (which would leave it present).
    delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    const onRegistrationFailed = vi.fn();

    const { registerServiceWorker } = await import("./registerServiceWorker");
    const sendSkipWaiting = registerServiceWorker({ onRegistrationFailed });

    expect(sendSkipWaiting).toBeUndefined();
    expect(onRegistrationFailed).toHaveBeenCalledTimes(1);
    expect(registerSWMock).not.toHaveBeenCalled();
  });

  it("registers successfully and returns a usable sendSkipWaiting function when registration succeeds (3.1, 3.2)", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: {},
      configurable: true,
    });
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
    registerSWMock.mockReturnValue(updateServiceWorker);
    const onRegistrationFailed = vi.fn();

    const { registerServiceWorker } = await import("./registerServiceWorker");
    const sendSkipWaiting = registerServiceWorker({ onRegistrationFailed });

    expect(typeof sendSkipWaiting).toBe("function");
    expect(onRegistrationFailed).not.toHaveBeenCalled();

    sendSkipWaiting?.();
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
  });

  it("reports the failure via onRegistrationFailed without throwing when registration/caching fails (fallback to direct network, 3.3)", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: {},
      configurable: true,
    });
    const registrationError = new Error("failed to cache assets");
    registerSWMock.mockImplementation((options?: RegisterSWOptions) => {
      options?.onRegisterError?.(registrationError);
      return vi.fn();
    });
    const onRegistrationFailed = vi.fn();

    const { registerServiceWorker } = await import("./registerServiceWorker");

    expect(() => registerServiceWorker({ onRegistrationFailed })).not.toThrow();
    expect(onRegistrationFailed).toHaveBeenCalledWith(registrationError);
  });

  it("reports the failure via onRegistrationFailed if registerSW() throws synchronously, without propagating the exception (3.3)", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: {},
      configurable: true,
    });
    const unexpectedError = new Error("unexpected registration failure");
    registerSWMock.mockImplementation(() => {
      throw unexpectedError;
    });
    const onRegistrationFailed = vi.fn();

    const { registerServiceWorker } = await import("./registerServiceWorker");
    let sendSkipWaiting: unknown;

    expect(() => {
      sendSkipWaiting = registerServiceWorker({ onRegistrationFailed });
    }).not.toThrow();
    expect(sendSkipWaiting).toBeUndefined();
    expect(onRegistrationFailed).toHaveBeenCalledWith(unexpectedError);
  });
});

describe("decideResponseSource — offline access-blocking contract with no prior cache (3.5)", () => {
  it("returns 'no-response' when offline with no cached resource at all, a signal a future bootstrap layer must use to block access to the Interfaz_Chat", () => {
    // Note: the exhaustiveness of this rule is already covered at the pure
    // function level by decideResponseSource.property.test.ts (Property 4).
    // Wiring up the UI/bootstrap layer that consumes this signal to
    // effectively block access is the responsibility of a later task
    // (16.1/22.2); here only the expected contract is fixed.
    expect(
      decideResponseSource({
        online: false,
        assetsCacheHit: false,
        isModelResource: false,
        modelCacheHit: false,
      }),
    ).toBe("no-response");
  });
});

describe("registerServiceWorker + createUpdateController — integrated deferred reload (9.4, 9.5, 9.6)", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: {},
      configurable: true,
    });
  });

  afterEach(() => {
    registerSWMock.mockReset();
  });

  it("applies the update immediately when there is no generation in progress, using the real function returned by registerServiceWorker (9.2)", async () => {
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
    registerSWMock.mockReturnValue(updateServiceWorker);

    const { registerServiceWorker } = await import("./registerServiceWorker");
    const sendSkipWaiting = assumeDefined(registerServiceWorker());

    const controller = createUpdateController(sendSkipWaiting);
    const result = controller.requestUpdate(idleState);

    expect(result).toBe("applied");
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
  });

  it("defers applying while a response is being generated and applies it automatically once it finishes, via the real registerServiceWorker function (9.4, 9.5)", async () => {
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
    registerSWMock.mockReturnValue(updateServiceWorker);

    const { registerServiceWorker } = await import("./registerServiceWorker");
    const sendSkipWaiting = assumeDefined(registerServiceWorker());
    const controller = createUpdateController(sendSkipWaiting);

    const result = controller.requestUpdate(generatingState);
    expect(result).toBe("deferred");
    expect(updateServiceWorker).not.toHaveBeenCalled();

    // Generation is still in progress: the deferred update is not applied yet.
    controller.notifyGenerationStateChange(generatingState);
    expect(updateServiceWorker).not.toHaveBeenCalled();

    // Generation finishes: the real postMessage is sent via updateServiceWorker.
    controller.notifyGenerationStateChange(completedState);
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
  });

  it("if the user dismisses the update notification (never calls requestUpdate), the generation in progress is not interrupted and no postMessage is sent (9.6)", async () => {
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
    registerSWMock.mockReturnValue(updateServiceWorker);

    const { registerServiceWorker } = await import("./registerServiceWorker");
    const sendSkipWaiting = assumeDefined(registerServiceWorker());
    const controller = createUpdateController(sendSkipWaiting);

    // The user dismisses: only generation state changes are notified, the
    // update is never requested.
    controller.notifyGenerationStateChange(generatingState);
    controller.notifyGenerationStateChange(completedState);

    expect(updateServiceWorker).not.toHaveBeenCalled();
  });
});
