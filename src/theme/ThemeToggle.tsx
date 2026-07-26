// ThemeToggle: header control that cycles the theme preference
// (Sistema -> Claro -> Oscuro -> Sistema -> ...). A single icon button
// (`.button--icon`) keeps the header compact on mobile while still exposing
// all three states via its accessible name.

import { useTheme } from "./useTheme";
import type { ThemePreference } from "./themePreference";
import "./ThemeToggle.css";

const ICON_BY_PREFERENCE: Record<ThemePreference, string> = {
  system: "🖥️",
  light: "☀️",
  dark: "🌙",
};

const LABEL_BY_PREFERENCE: Record<ThemePreference, string> = {
  system: "Tema: sigue al sistema",
  light: "Tema: claro",
  dark: "Tema: oscuro",
};

const NEXT_LABEL_BY_PREFERENCE: Record<ThemePreference, string> = {
  system: "cambiar a claro",
  light: "cambiar a oscuro",
  dark: "cambiar a seguir al sistema",
};

export function ThemeToggle() {
  const { preference, cyclePreference } = useTheme();

  const label = `${LABEL_BY_PREFERENCE[preference]} (${NEXT_LABEL_BY_PREFERENCE[preference]})`;

  return (
    <button
      type="button"
      className="theme-toggle button button--ghost button--icon"
      onClick={cyclePreference}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{ICON_BY_PREFERENCE[preference]}</span>
    </button>
  );
}
