import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaManifest } from './src/pwa-install/pwaManifest.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Custom Service Worker (src/service-worker-app/sw.ts): allows manual
      // handling (cache-first + integrity verification) of model resources
      // (Model_Cache) that Workbox doesn't fully manage, per design.md
      // (section "Service_Worker_App").
      strategies: 'injectManifest',
      srcDir: 'src/service-worker-app',
      filename: 'sw.ts',
      injectManifest: {
        // Model resources are handled manually in sw.ts and must not be
        // part of the static asset precache.
        globIgnores: ['**/modelos/**'],
        // The WebLLM SDK (`@mlc-ai/web-llm`, lazily imported by
        // `AppStateProvider`) compiles into its own multi-MB chunk. The
        // default precache limit (2 MiB) is raised so that chunk keeps
        // being served offline via Cache_Assets like the rest of the app's
        // assets.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
      // 'prompt': the Service_Worker_App downloads the new version in the
      // background without activating it (3.7) until the user accepts the
      // update (9.1, 9.2); the deferred activation is wired into the full
      // lifecycle in task 9.6.
      registerType: 'prompt',
      injectRegister: false,
      devOptions: {
        enabled: false,
      },
      includeAssets: ['favicon.svg', 'icons.svg'],
      // `manifest` object extracted to `src/pwa-install/pwaManifest.ts` so
      // the installability smoke test (11.1, task 20.4) can import and
      // inspect it without running a full build.
      manifest: pwaManifest,
    }),
  ],
})
