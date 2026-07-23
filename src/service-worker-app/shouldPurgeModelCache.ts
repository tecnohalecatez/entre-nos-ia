// Pure decision function for purging the Cache_Modelo of the Service_Worker_App.
// See .kiro/specs/asistente-ia-local/design.md (section "Service_Worker_App")
// for the design detail of this function.

/**
 * PURE function subjected to PBT (Property 13).
 *
 * Determines whether the Service_Worker_App must purge Cache_Modelo when
 * applying an update, per Requisito 9.3: it is purged if and only if the
 * model version required by the new app version differs from the currently
 * cached version.
 *
 * shouldPurgeModelCache(a, b) === (a !== b)
 */
export function shouldPurgeModelCache(
  currentModelVersion: string,
  requiredModelVersion: string,
): boolean {
  return currentModelVersion !== requiredModelVersion;
}
