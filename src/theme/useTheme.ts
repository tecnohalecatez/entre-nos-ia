import { useContext } from "react";
import { ThemeContext, type ThemeContextValue } from "./context";

/** Hook to access the theme context (see `ThemeProvider`). */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error("useTheme() must be used within a <ThemeProvider>");
  }
  return context;
}
