// Smoke test (SMOKE, not PBT) of the Manifest_App configured in
// `vite-plugin-pwa` (task 20.4). See
// .kiro/specs/asistente-ia-local/design.md (section "Testing Strategy":
// "Instalabilidad: manifest válido (11.1, SMOKE)...") and Requirement 11.1.
//
// Requirement 11.1: "THE Sistema SHALL exponer un Manifest_App enlazado desde
// el documento principal de la aplicación, que declare el nombre de la
// aplicación, un nombre corto, al menos un ícono en formato adecuado para
// instalación, un color de tema, y el modo de visualización configurado
// como Modo_Standalone."
//
// Imports `pwaManifest` (the same object `vite.config.ts` passes to
// `VitePWA({ manifest: ... })`) instead of running a full build and reading
// the generated `manifest.webmanifest`: it's deterministic, fast, and
// verifies the single source of truth for the manifest without build
// artifacts to clean up.
import { describe, expect, it } from "vitest";
import { pwaManifest } from "./pwaManifest";

describe("Manifest_App (Requisito 11.1, SMOKE)", () => {
  it("declares a non-empty name and short name", () => {
    expect(pwaManifest.name).toBeTruthy();
    expect(pwaManifest.short_name).toBeTruthy();
  });

  it("declares at least one icon with valid src, sizes and type", () => {
    const icons = pwaManifest.icons ?? [];
    expect(icons.length).toBeGreaterThan(0);

    for (const icon of icons) {
      expect(icon.src).toBeTruthy();
      expect(icon.sizes).toMatch(/^\d+x\d+$/);
      expect(icon.type).toBeTruthy();
    }
  });

  it("declares a theme color as a valid hex color", () => {
    expect(pwaManifest.theme_color).toMatch(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  });

  it("declares the display mode as Modo_Standalone", () => {
    expect(pwaManifest.display).toBe("standalone");
  });
});
