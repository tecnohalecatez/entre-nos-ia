import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";
import { ThemeProvider } from "./ThemeProvider";
import type { SystemPrefersDarkQuery } from "./ThemeProvider";

function createFakeStorage(): Storage {
  const data = new Map<string, string>();
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

function renderToggle() {
  const query: SystemPrefersDarkQuery = { matches: false };
  return render(
    <ThemeProvider storage={createFakeStorage()} createSystemPrefersDarkQuery={() => query} root={document.createElement("html")}>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeToggle", () => {
  it("starts announcing the 'system' preference and offers switching to light", () => {
    renderToggle();

    expect(
      screen.getByRole("button", { name: "Tema: sigue al sistema (cambiar a claro)" }),
    ).toBeInTheDocument();
  });

  it("cycles the accessible name and icon as it's clicked", async () => {
    const user = userEvent.setup();
    renderToggle();

    const button = screen.getByRole("button", { name: "Tema: sigue al sistema (cambiar a claro)" });

    await user.click(button);
    expect(screen.getByRole("button", { name: "Tema: claro (cambiar a oscuro)" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tema: claro (cambiar a oscuro)" }));
    expect(
      screen.getByRole("button", { name: "Tema: oscuro (cambiar a seguir al sistema)" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tema: oscuro (cambiar a seguir al sistema)" }));
    expect(
      screen.getByRole("button", { name: "Tema: sigue al sistema (cambiar a claro)" }),
    ).toBeInTheDocument();
  });
});
