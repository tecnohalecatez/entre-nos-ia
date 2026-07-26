// App_State: build/release version shown in the Interfaz_Chat header, so a
// deployed build can be identified at a glance (e.g. when comparing what a
// user sees against what's actually live on Amplify).
//
// Format: `AA.M.consecutivo.compilacion` (año.mes.consecutivo.build) --
// `AA`/`M` are the year/month of the release, `consecutivo` is a running
// count of releases within that month, `compilacion` a build counter within
// that release. Bumped manually per deploy: same pattern as
// `REQUIRED_MODEL_VERSION` (`src/service-worker-app/sw.ts`) and `MODEL_ID_*`
// (`configuration.ts`) -- fixed as a source-code constant in the absence of
// a build-level versioning pipeline.
export const APP_VERSION = "26.7.0.1";
