import { describe, expect, it, vi } from "vitest";
import { manageModelCacheVersion } from "./manageModelCacheVersion";
import type { ModelVersionStore } from "./manageModelCacheVersion";

function createFakeVersionStore(initialVersion: string | undefined): ModelVersionStore & {
  savedVersion(): string | undefined;
} {
  let version = initialVersion;
  return {
    get() {
      return Promise.resolve(version);
    },
    save(newVersion: string) {
      version = newVersion;
      return Promise.resolve();
    },
    savedVersion() {
      return version;
    },
  };
}

describe("manageModelCacheVersion", () => {
  it("does not purge on the first activation (no previously stored version)", async () => {
    const versionStore = createFakeVersionStore(undefined);
    const purgeModelCache = vi.fn().mockResolvedValue(undefined);

    await manageModelCacheVersion("v1", { versionStore, purgeModelCache });

    expect(purgeModelCache).not.toHaveBeenCalled();
    expect(versionStore.savedVersion()).toBe("v1");
  });

  it("does not purge when the required version matches the stored one", async () => {
    const versionStore = createFakeVersionStore("v1");
    const purgeModelCache = vi.fn().mockResolvedValue(undefined);

    await manageModelCacheVersion("v1", { versionStore, purgeModelCache });

    expect(purgeModelCache).not.toHaveBeenCalled();
    expect(versionStore.savedVersion()).toBe("v1");
  });

  it("purges Cache_Modelo when the required version differs from the stored one (9.3)", async () => {
    const versionStore = createFakeVersionStore("v1");
    const purgeModelCache = vi.fn().mockResolvedValue(undefined);

    await manageModelCacheVersion("v2", { versionStore, purgeModelCache });

    expect(purgeModelCache).toHaveBeenCalledTimes(1);
    expect(versionStore.savedVersion()).toBe("v2");
  });
});
