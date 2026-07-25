import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ThemeProvider } from "./ThemeProvider";
import type { SystemPrefersDarkQuery } from "./ThemeProvider";
import { useTheme } from "./useTheme";

/** Minimal in-memory `Storage` double (see `themePreference.test.ts`). */
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

/** Fake `SystemPrefersDarkQuery` that can simulate the OS changing preference. */
function createFakeQuery(initialMatches: boolean): {
  query: SystemPrefersDarkQuery;
  fireChange: (matches: boolean) => void;
} {
  let listener: ((event: { matches: boolean }) => void) | null = null;
  const query: SystemPrefersDarkQuery = {
    matches: initialMatches,
    addEventListener: (_type, callback) => {
      listener = callback;
    },
    removeEventListener: () => {
      listener = null;
    },
  };
  return {
    query,
    fireChange: (matches: boolean) => {
      listener?.({ matches });
    },
  };
}

/** Exposes `useTheme()`'s value through the DOM for assertions. */
function Trigger() {
  const { preference, resolvedTheme, cyclePreference } = useTheme();
  return (
    <div>
      <p>preference: {preference}</p>
      <p>resolvedTheme: {resolvedTheme}</p>
      <button type="button" onClick={cyclePreference}>
        cycle
      </button>
    </div>
  );
}

describe("ThemeProvider", () => {
  it("clicking cycles the preference and applies it to the injected root", async () => {
    const user = userEvent.setup();
    const storage = createFakeStorage();
    const root = document.createElement("html");
    const { query } = createFakeQuery(false);

    render(
      <ThemeProvider storage={storage} createSystemPrefersDarkQuery={() => query} root={root}>
        <Trigger />
      </ThemeProvider>,
    );

    expect(screen.getByText("preference: system")).toBeInTheDocument();
    expect(root.dataset.theme).toBe("light");

    await user.click(screen.getByRole("button", { name: "cycle" }));
    expect(screen.getByText("preference: light")).toBeInTheDocument();
    expect(root.dataset.theme).toBe("light");

    await user.click(screen.getByRole("button", { name: "cycle" }));
    expect(screen.getByText("preference: dark")).toBeInTheDocument();
    expect(root.dataset.theme).toBe("dark");

    await user.click(screen.getByRole("button", { name: "cycle" }));
    expect(screen.getByText("preference: system")).toBeInTheDocument();
  });

  it("persists the preference to the injected storage", async () => {
    const user = userEvent.setup();
    const storage = createFakeStorage();
    const { query } = createFakeQuery(false);

    render(
      <ThemeProvider storage={storage} createSystemPrefersDarkQuery={() => query} root={document.createElement("html")}>
        <Trigger />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "cycle" }));

    expect(storage.getItem("entre-nos-ia.theme")).toBe("light");
  });

  it("while preference is 'system', follows the OS query's change events", async () => {
    const storage = createFakeStorage();
    const { query, fireChange } = createFakeQuery(false);

    render(
      <ThemeProvider storage={storage} createSystemPrefersDarkQuery={() => query} root={document.createElement("html")}>
        <Trigger />
      </ThemeProvider>,
    );

    expect(screen.getByText("resolvedTheme: light")).toBeInTheDocument();

    fireChange(true);

    expect(await screen.findByText("resolvedTheme: dark")).toBeInTheDocument();
  });

  it("does not throw when the system query source has no addEventListener", () => {
    const storage = createFakeStorage();
    const bareQuery: SystemPrefersDarkQuery = { matches: true };

    expect(() => {
      render(
        <ThemeProvider storage={storage} createSystemPrefersDarkQuery={() => bareQuery} root={document.createElement("html")}>
          <Trigger />
        </ThemeProvider>,
      );
    }).not.toThrow();

    expect(screen.getByText("resolvedTheme: dark")).toBeInTheDocument();
  });

  it("does not throw when there is no system query source at all (returns null)", () => {
    const storage = createFakeStorage();

    expect(() => {
      render(
        <ThemeProvider storage={storage} createSystemPrefersDarkQuery={() => null} root={document.createElement("html")}>
          <Trigger />
        </ThemeProvider>,
      );
    }).not.toThrow();

    expect(screen.getByText("resolvedTheme: light")).toBeInTheDocument();
  });

  it("throws a descriptive error if useTheme() is used outside the provider", () => {
    function ComponentWithoutProvider() {
      useTheme();
      return null;
    }

    expect(() => {
      render(<ComponentWithoutProvider />);
    }).toThrow(/useTheme\(\) must be used within a <ThemeProvider>/);
  });
});
