// Orchestration (Service Worker side) of the Cache_Modelo purge on a
// required-model-version change, when a new version of the
// Service_Worker_App is activated (Requisito 9.3). See
// .kiro/specs/asistente-ia-local/design.md (section "Service_Worker_App").
//
// The decision of WHETHER to purge is the pure function `shouldPurgeModelCache`
// (task 9.3, Property 13); this module orchestrates that decision against an
// injected `ModelVersionStore`, to remain testable without depending
// directly on the Service Worker's Cache API (`sw.ts` provides the real
// implementation based on the Cache API).

import { shouldPurgeModelCache } from "./shouldPurgeModelCache";

/** Store for the model version currently reflected in Cache_Modelo. */
export interface ModelVersionStore {
  /** Returns the stored version, or `undefined` if there isn't one yet (first activation). */
  get(): Promise<string | undefined>;
  save(version: string): Promise<void>;
}

export interface ManageModelCacheVersionDeps {
  versionStore: ModelVersionStore;
  /** Removes the Cache_Modelo content corresponding to the previous version. */
  purgeModelCache(): Promise<void>;
}

/**
 * When a new version of the Service_Worker_App is activated, compares the
 * stored model version against the one required by this version and, if
 * they differ (`shouldPurgeModelCache`), purges Cache_Modelo (9.3). In any
 * case, updates the stored version marker to `requiredModelVersion`.
 *
 * On the first activation (with no version stored yet) nothing is purged:
 * there is no "previous version" to purge files from.
 */
export async function manageModelCacheVersion(
  requiredModelVersion: string,
  deps: ManageModelCacheVersionDeps,
): Promise<void> {
  const storedVersion = await deps.versionStore.get();

  if (
    storedVersion !== undefined &&
    shouldPurgeModelCache(storedVersion, requiredModelVersion)
  ) {
    await deps.purgeModelCache();
  }

  await deps.versionStore.save(requiredModelVersion);
}
