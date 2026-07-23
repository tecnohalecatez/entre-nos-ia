// PWA `manifest` object (Manifest_App), extracted from `vite.config.ts` so
// it can be imported in isolation both from the Vite configuration
// (`VitePWA({ manifest: ... })`) and from the installability smoke test
// (task 20.4), without needing to run a full build to inspect its content.
//
// See .kiro/specs/asistente-ia-local/requirements.md (11.1):
// "THE Sistema SHALL exponer un Manifest_App enlazado desde el documento
// principal de la aplicación, que declare el nombre de la aplicación, un
// nombre corto, al menos un ícono en formato adecuado para instalación, un
// color de tema, y el modo de visualización configurado como
// Modo_Standalone."
import type { ManifestOptions } from "vite-plugin-pwa";

export const pwaManifest: Partial<ManifestOptions> = {
  name: "entre-nos-ia — Asistente de IA Local",
  short_name: "entre-nos-ia",
  description:
    "Asistente de IA conversacional que se ejecuta completamente en el navegador, sin enviar tus conversaciones a ningún servidor.",
  theme_color: "#863bff",
  background_color: "#ffffff",
  display: "standalone",
  start_url: "/",
  icons: [
    {
      src: "/pwa-icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "/pwa-icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
    },
    {
      src: "/pwa-icons/icon-512-maskable.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};
