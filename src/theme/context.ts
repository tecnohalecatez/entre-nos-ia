// Theme: React context for the light/dark theme preference.
// See `ThemeProvider.tsx` for the implementation and `themePreference.ts`
// for the framework-agnostic logic.

import { createContext } from "react";
import type { ThemePreference, ResolvedTheme } from "./themePreference";

export interface ThemeContextValue {
  /** The user's raw choice ("system" follows the OS). */
  preference: ThemePreference;
  /** The theme actually applied to the page right now. */
  resolvedTheme: ResolvedTheme;
  /** Advances `preference` to the next value in the Sistema -> Claro -> Oscuro cycle. */
  cyclePreference: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
