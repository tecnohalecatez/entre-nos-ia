// App_State: Standalone_Mode detection (Requirements 11.4, 11.5).
//
// By design, the System does NOT branch its functional behavior based on
// whether it runs inside a browser tab or as a PWA installed in
// Standalone_Mode: Requirement 11.5 mandates exactly the same functionality
// in both cases, and that equivalence already holds without extra code
// because Standalone_Mode is just a browser presentation mode (no address
// bar/chrome) declared in the App_Manifest (`display: "standalone"`, task
// 9.x/20.3) -- no other part of the system (Compatibility_Detector,
// Model_Download_Manager, Inference_Engine, Service_Worker_App) consults the
// display mode.
//
// This function exists as a testable signal that the app is running in
// Standalone_Mode (e.g. for telemetry or purely cosmetic UI adjustments in
// the future), and to be able to verify in tests that the whole app tree
// mounts and works the same regardless of this detection's result (see
// `standaloneMode.test.ts`).
export function isInStandaloneMode(): boolean {
  const standaloneByMatchMedia =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;

  // `navigator.standalone` is a non-standard Safari/iOS extension (not
  // declared in lib.dom.d.ts types) for PWAs added to the home screen before
  // that browser supported `display-mode` in `matchMedia`.
  const standaloneByNavigatorIOS =
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return standaloneByMatchMedia || standaloneByNavigatorIOS;
}
