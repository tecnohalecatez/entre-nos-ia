// App_State: lightweight `sessionStorage` markers used to answer, on the
// NEXT page load, a question the app otherwise cannot answer on-device --
// especially on a phone or tablet with no accessible devtools: "why did the
// previous page session end? Did the browser process crash (e.g. an
// out-of-memory kill during model loading or generation), or did something
// reload the page on purpose (the Service_Worker_App update flow,
// `registerServiceWorker.ts`)?"
//
// Two independent phase markers:
//
// - LOADING: set for the duration of `InferenceEngine.initialize()`
//   (`AppStateProvider.tsx`'s boot sequence) -- the heaviest phase memory-
//   wise (downloading, decompressing and shader-compiling ~880 MB of
//   weights), and where a silent crash was observed (a phone reported
//   "loads then reloads" with no error screen at all -- see
//   `recordLoadCrash()`/`resetLoadCrashCount()` below).
// - GENERATING: set for the duration of `InferenceEngine.generate()`
//   (`useSendMessage.ts`, `runGeneration()`).
//
// Both are cleared in a `finally` so they clear on every normal exit
// (success, cancel, error -- anything that runs JS to completion). If
// either is still set on the NEXT boot, the previous page never got to run
// that `finally` -- i.e. its teardown didn't go through any code path this
// app controls. That's the signature of a crash, not a caught error.
//
// - RELOAD_REASON: set immediately before a KNOWN, deliberate reload
//   (currently only the service-worker-update reload,
//   `registerServiceWorker.ts`). If present on the next boot, the previous
//   page's end is already explained -- ruling out "crash" even if a phase
//   marker also happened to be set (e.g. the update reload landing
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

const LOADING_KEY = "entre-nos-ia:loading";
const GENERATING_KEY = "entre-nos-ia:generating";
const RELOAD_REASON_KEY = "entre-nos-ia:reload-reason";
const LOAD_CRASH_COUNT_KEY = "entre-nos-ia:load-crash-count";

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Marks that `InferenceEngine.initialize()` is in flight. Call right before awaiting it. */
export function markLoadingStarted(): void {
  try {
    safeSessionStorage()?.setItem(LOADING_KEY, "1");
  } catch {
    // Best-effort: never let a storage failure affect loading itself.
  }
}

/** Clears the in-flight loading marker. Must be called in a `finally` so every normal exit clears it. */
export function markLoadingFinished(): void {
  try {
    safeSessionStorage()?.removeItem(LOADING_KEY);
  } catch {
    // Best-effort.
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

export type PreviousSessionSignal = "crashed_while_loading" | "crashed_while_generating" | "none";

/**
 * Reads and CLEARS the phase markers and the reload-reason marker -- must
 * be called exactly once, at boot, before this new session's own
 * `markLoadingStarted()`/`markGenerationStarted()`/`markReloadReason()`
 * calls could overwrite what the previous session left behind.
 *
 * `"crashed_while_loading"` takes priority over `"crashed_while_generating"`
 * if both markers were somehow left set (shouldn't happen in practice --
 * loading and generating don't overlap -- but there's no reason to leave
 * that case undefined).
 */
export function takePreviousSessionSignal(): PreviousSessionSignal {
  try {
    const storage = safeSessionStorage();
    if (storage === null) {
      return "none";
    }
    const wasLoading = storage.getItem(LOADING_KEY) !== null;
    const wasGenerating = storage.getItem(GENERATING_KEY) !== null;
    const reloadReason = storage.getItem(RELOAD_REASON_KEY);
    storage.removeItem(LOADING_KEY);
    storage.removeItem(GENERATING_KEY);
    storage.removeItem(RELOAD_REASON_KEY);

    if (reloadReason !== null) {
      return "none";
    }
    if (wasLoading) {
      return "crashed_while_loading";
    }
    if (wasGenerating) {
      return "crashed_while_generating";
    }
    return "none";
  } catch {
    return "none";
  }
}

/**
 * Increments and persists a counter of CONSECUTIVE crashes detected while
 * loading the model (`"crashed_while_loading"`), across reloads within this
 * tab session. Used by `AppStateProvider.tsx` to stop silently retrying
 * forever -- a phone was observed "loading, then reloading" in an endless,
 * invisible loop with no error ever shown -- and instead show a clear
 * message with a manual retry after a couple of consecutive failures.
 *
 * Returns `1` (never trips a "repeated" threshold) if `sessionStorage`
 * isn't available: without persistence there's no way to distinguish
 * "first time" from "Nth time", so the conservative choice is to always
 * keep retrying rather than risk getting stuck showing a "repeated crash"
 * screen after a single occurrence.
 */
export function recordLoadCrash(): number {
  try {
    const storage = safeSessionStorage();
    if (storage === null) {
      return 1;
    }
    const current = Number(storage.getItem(LOAD_CRASH_COUNT_KEY) ?? "0");
    const next = (Number.isFinite(current) ? current : 0) + 1;
    storage.setItem(LOAD_CRASH_COUNT_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

/** Clears the consecutive-load-crash counter. Call after a successful `InferenceEngine.initialize()`. */
export function resetLoadCrashCount(): void {
  try {
    safeSessionStorage()?.removeItem(LOAD_CRASH_COUNT_KEY);
  } catch {
    // Best-effort.
  }
}
