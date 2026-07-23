// Resolution stub for the virtual module `virtual:pwa-register` (injected by
// Vite/vite-plugin-pwa only at build/dev time), used ONLY in tests. Vitest
// cannot resolve Vite virtual modules directly, so `vitest.config.ts`
// aliases the `virtual:pwa-register` specifier to this real file; tests then
// use `vi.mock("virtual:pwa-register", ...)` to replace its implementation
// (`registerSW`) according to the scenario under test.
//
// The real implementation lives in `vite-plugin-pwa` and does not run in tests.
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  throw new Error(
    "virtualPwaRegisterStub: registerSW() must not be invoked without mocking " +
      "'virtual:pwa-register' first with vi.mock() in the test.",
  );
}
