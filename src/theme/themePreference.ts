// Pure logic for the light/dark theme preference: no React, no DOM globals
// touched directly (the caller passes in whatever `Storage`/root element it
// has), so this is trivially unit-testable and reusable both from
// `ThemeProvider` (React) and from `main.tsx` (pre-render, to avoid a
// flash of the wrong theme before React mounts).

/** User-facing choice: follow the OS, or force one of the two themes. */
export type ThemePreference = "system" | "light" | "dark";

/** The theme actually applied to the page, after resolving "system". */
export type ResolvedTheme = "light" | "dark";

export const THEME_PREFERENCE_ORDER: readonly ThemePreference[] = ["system", "light", "dark"];

const STORAGE_KEY = "entre-nos-ia.theme";

/** Cycles Sistema -> Claro -> Oscuro -> Sistema -> ... */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCE_ORDER.indexOf(current);
  const nextIndex = (index + 1) % THEME_PREFERENCE_ORDER.length;
  return THEME_PREFERENCE_ORDER[nextIndex] ?? "system";
}

/** Resolves a preference to an actual theme, given the OS's current setting. */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return preference;
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * Reads the persisted preference. Defensive by design: `storage` may be
 * unavailable, may throw (Safari private mode, exhausted quota), or may
 * hold a value from a future/older version of this app -- none of that
 * should ever prevent boot, so any of those cases fall back to `"system"`.
 */
export function readStoredPreference(storage: Storage | null | undefined): ThemePreference {
  if (storage === null || storage === undefined) {
    return "system";
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return isThemePreference(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

/** Persists `preference`. Silently ignores storage failures (see above). */
export function writeStoredPreference(storage: Storage | null | undefined, preference: ThemePreference): void {
  if (storage === null || storage === undefined) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, preference);
  } catch {
    // Best-effort: losing the persisted preference must not break the app.
  }
}

/**
 * Applies `resolved` to the document root: `data-theme` (consumed by
 * `index.css`'s `:root[data-theme="dark"]` overrides) and `color-scheme`
 * (so native form controls / scrollbars follow too).
 */
export function applyTheme(root: HTMLElement, resolved: ResolvedTheme): void {
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}
