import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vitest configuration for the asistente-ia-local project.
// happy-dom is used as the environment to allow React component tests, and
// fast-check for property-based testing (see src/testing-conventions.md).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // `virtual:pwa-register` is a virtual module injected by Vite at
      // build/dev time (vite-plugin-pwa) that Vitest can't resolve on its
      // own. It's aliased to a real stub so tests can replace it with
      // `vi.mock("virtual:pwa-register", ...)` (task 9.7).
      'virtual:pwa-register': '/src/testing/virtualPwaRegisterStub.ts',
    },
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['./src/testing/setupTestingLibrary.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Excludes macOS metadata artifacts (AppleDouble, "._" prefix) that
    // show up on exFAT/network volumes and aren't real test files.
    exclude: ['**/node_modules/**', '**/._*'],
  },
})
