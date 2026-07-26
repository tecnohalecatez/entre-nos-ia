import { describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  nextThemePreference,
  readStoredPreference,
  resolveTheme,
  writeStoredPreference,
} from "./themePreference";

/** Minimal in-memory `Storage` double, avoiding a dependency on jsdom/happy-dom's implementation. */
function createFakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
}

describe("nextThemePreference", () => {
  it("cycles system -> light -> dark -> system", () => {
    expect(nextThemePreference("system")).toBe("light");
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("system");
  });
});

describe("resolveTheme", () => {
  it.each([
    ["system", true, "dark"],
    ["system", false, "light"],
    ["light", true, "light"],
    ["light", false, "light"],
    ["dark", true, "dark"],
    ["dark", false, "dark"],
  ] as const)("resolveTheme(%s, systemPrefersDark=%s) -> %s", (preference, systemPrefersDark, expected) => {
    expect(resolveTheme(preference, systemPrefersDark)).toBe(expected);
  });
});

describe("readStoredPreference", () => {
  it("returns the stored value when it's valid", () => {
    const storage = createFakeStorage({ "entre-nos-ia.theme": "dark" });
    expect(readStoredPreference(storage)).toBe("dark");
  });

  it("falls back to 'system' when nothing is stored", () => {
    expect(readStoredPreference(createFakeStorage())).toBe("system");
  });

  it("falls back to 'system' when the stored value is corrupt/unrecognized", () => {
    const storage = createFakeStorage({ "entre-nos-ia.theme": "purple" });
    expect(readStoredPreference(storage)).toBe("system");
  });

  it("falls back to 'system' when storage is null/undefined", () => {
    expect(readStoredPreference(null)).toBe("system");
    expect(readStoredPreference(undefined)).toBe("system");
  });

  it("falls back to 'system' when storage.getItem throws", () => {
    const storage = createFakeStorage();
    storage.getItem = () => {
      throw new Error("blocked by private mode");
    };
    expect(readStoredPreference(storage)).toBe("system");
  });
});

describe("writeStoredPreference", () => {
  it("persists the preference", () => {
    const storage = createFakeStorage();
    writeStoredPreference(storage, "light");
    expect(storage.getItem("entre-nos-ia.theme")).toBe("light");
  });

  it("does not throw when storage is null/undefined", () => {
    expect(() => {
      writeStoredPreference(null, "dark");
    }).not.toThrow();
    expect(() => {
      writeStoredPreference(undefined, "dark");
    }).not.toThrow();
  });

  it("does not throw when storage.setItem throws (quota/private mode)", () => {
    const storage = createFakeStorage();
    storage.setItem = vi.fn(() => {
      throw new Error("quota exceeded");
    });
    expect(() => {
      writeStoredPreference(storage, "dark");
    }).not.toThrow();
  });
});

describe("applyTheme", () => {
  it("sets data-theme and color-scheme on the given root element", () => {
    const root = document.createElement("html");
    applyTheme(root, "dark");
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");

    applyTheme(root, "light");
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });
});
