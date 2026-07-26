// Theme: Provider component that owns the light/dark theme preference,
// persists it, keeps it in sync with the OS while `preference === "system"`,
// and applies it to the document root.
//
// Side-effecting dependencies (`storage`, the "does the OS prefer dark"
// media query source, and the DOM root to apply the theme to) are injectable
// props with production defaults, following the same pattern as
// `AppStateProviderProps` (`src/app-state/AppStateProvider.tsx`), so this
// provider is testable without touching `window.localStorage`/`matchMedia`.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ThemeContext } from "./context";
import {
  applyTheme,
  nextThemePreference,
  readStoredPreference,
  resolveTheme,
  writeStoredPreference,
} from "./themePreference";
import type { ThemePreference } from "./themePreference";

/**
 * Minimal surface of `MediaQueryList` this provider needs. A dedicated type
 * (instead of using `MediaQueryList` directly) so tests can inject a plain
 * object -- in particular, some existing suites
 * (`src/app-state/standaloneMode.test.tsx`, `src/e2e-integration.test.tsx`)
 * already mock `window.matchMedia` to return a bare `{ matches }` object
 * with no `addEventListener`, so subscribing must degrade gracefully rather
 * than throw.
 */
export interface SystemPrefersDarkQuery {
  readonly matches: boolean;
  addEventListener?: (type: "change", listener: (event: { matches: boolean }) => void) => void;
  removeEventListener?: (type: "change", listener: (event: { matches: boolean }) => void) => void;
}

function defaultStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    // Safari private mode (and similar) can throw just accessing the
    // property, not only on read/write.
    return null;
  }
}

function defaultSystemPrefersDarkQuery(): SystemPrefersDarkQuery | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia("(prefers-color-scheme: dark)");
}

function defaultRoot(): HTMLElement | null {
  return typeof document !== "undefined" ? document.documentElement : null;
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Defaults to `window.localStorage`. Inject a fake `Storage` in tests. */
  storage?: Storage | null;
  /**
   * Defaults to `window.matchMedia("(prefers-color-scheme: dark)")`.
   * Inject a fake `SystemPrefersDarkQuery` in tests.
   */
  createSystemPrefersDarkQuery?: () => SystemPrefersDarkQuery | null;
  /** Defaults to `document.documentElement`. Inject a fake element in tests. */
  root?: HTMLElement | null;
}

export function ThemeProvider({
  children,
  storage = defaultStorage(),
  createSystemPrefersDarkQuery = defaultSystemPrefersDarkQuery,
  root = defaultRoot(),
}: ThemeProviderProps) {
  const [preference, setPreference] = useState<ThemePreference>(() => readStoredPreference(storage));
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(
    () => createSystemPrefersDarkQuery()?.matches ?? false,
  );

  // Keeps `systemPrefersDark` in sync with the OS while it's being followed
  // (`preference === "system"`) and the user later changes it without
  // reloading the page.
  useEffect(() => {
    const query = createSystemPrefersDarkQuery();
    if (query === null || typeof query.addEventListener !== "function") {
      return;
    }

    function handleChange(event: { matches: boolean }): void {
      setSystemPrefersDark(event.matches);
    }

    query.addEventListener("change", handleChange);
    return () => {
      query.removeEventListener?.("change", handleChange);
    };
  }, [createSystemPrefersDarkQuery]);

  const resolvedTheme = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    if (root !== null) {
      applyTheme(root, resolvedTheme);
    }
  }, [root, resolvedTheme]);

  const cyclePreference = useCallback(() => {
    setPreference((current) => {
      const next = nextThemePreference(current);
      writeStoredPreference(storage, next);
      return next;
    });
  }, [storage]);

  const contextValue = useMemo(
    () => ({ preference, resolvedTheme, cyclePreference }),
    [preference, resolvedTheme, cyclePreference],
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}
