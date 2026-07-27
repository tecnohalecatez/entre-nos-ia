// App_State: lightweight `sessionStorage` markers used to answer, on the
// NEXT page load, a question the app otherwise cannot answer on-device --
// especially on a phone or tablet with no accessible devtools: "why did the
// previous page session end? Did the browser process crash (e.g. an
// out-of-memory kill during generation), or did something reload the page
// on purpose (the Service_Worker_App update flow, `registerServiceWorker.ts`)?"
//
// Two independent flags:
//
// - GENERATING: set for the duration of `InferenceEngine.generate()`
//   (`useSendMessage.ts`, `runGeneration()`), cleared in a `finally` so it
//   clears on every normal exit (success, cancel, error -- anything that
//   runs JS to completion). If it's still set on the NEXT boot, the
//   previous page never got to run that `finally` -- i.e. its teardown
//   didn't go through any code path this app controls. That's the signature
//   of a crash, not a caught error.
// - RELOAD_REASON: set immediately before a KNOWN, deliberate reload
//   (currently only the service-worker-update reload,
//   `registerServiceWorker.ts`). If present on the next boot, the previous
//   page's end is already explained -- ruling out "crash" even if
//   GENERATING also happened to be set (e.g. the update reload landing
//   mid-generation).
//
// `sessionStorage` (not `localStorage`): scoped to the tab, cleared when the
// tab/window closes, which is exactly the lifetime this needs to reason
// about -- it survives an in-tab reload (a crash-and-restore or an explicit
// `location.reload()`) but not a genuinely new session.
//
// Best-effort, not a guaranteed signal: `sessionStorage` can throw in
// private-browsing/storage-restricted contexts, and no browser guarantees a
// crashed tab's `sessionStorage` will still be there when it restarts. Every
// access is wrapped in try/catch; none of this may ever break the boot
// sequence.

const GENERATING_KEY = "entre-nos-ia:generating";
const RELOAD_REASON_KEY = "entre-nos-ia:reload-reason";

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Marks that a generation request is in flight. Call at the start of `InferenceEngine.generate()`'s consumption loop. */
export function markGenerationStarted(): void {
  try {
    safeSessionStorage()?.setItem(GENERATING_KEY, "1");
  } catch {
    // Best-effort: never let a storage failure affect generation itself.
  }
}

/** Clears the in-flight marker. Must be called in a `finally` so every normal exit clears it. */
export function markGenerationFinished(): void {
  try {
    safeSessionStorage()?.removeItem(GENERATING_KEY);
  } catch {
    // Best-effort.
  }
}

export type ReloadReason = "sw-update";

/** Marks the reason for a deliberate, imminent reload. Call immediately before triggering it. */
export function markReloadReason(reason: ReloadReason): void {
  try {
    safeSessionStorage()?.setItem(RELOAD_REASON_KEY, reason);
  } catch {
    // Best-effort.
  }
}

export type PreviousSessionSignal = "crashed_while_generating" | "none";

/**
 * Reads and CLEARS both markers -- must be called exactly once, at boot,
 * before this new session's own `markGenerationStarted()`/`markReloadReason()`
 * calls could overwrite what the previous session left behind.
 */
export function takePreviousSessionSignal(): PreviousSessionSignal {
  try {
    const storage = safeSessionStorage();
    if (storage === null) {
      return "none";
    }
    const wasGenerating = storage.getItem(GENERATING_KEY) !== null;
    const reloadReason = storage.getItem(RELOAD_REASON_KEY);
    storage.removeItem(GENERATING_KEY);
    storage.removeItem(RELOAD_REASON_KEY);

    if (wasGenerating && reloadReason === null) {
      return "crashed_while_generating";
    }
    return "none";
  } catch {
    return "none";
  }
}
