// Tests for `PwaInstallControl` / `usePwaInstall` (task 20.3).
//
// The test browser (happy-dom) does not natively implement
// `beforeinstallprompt`: a plain `Event` is constructed and simulated
// `prompt()` and `userChoice` are assigned to it before dispatching it on
// `window`, mimicking what a real browser would do with the shape of
// `BeforeInstallPromptEvent`.
//
// See .kiro/specs/asistente-ia-local/requirements.md (11.2, 11.3, 11.6).

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationProvider } from "../notification";
import { PwaInstallControl } from "./PwaInstallControl";

function createBeforeInstallPromptEvent(
  overrides: Partial<Pick<BeforeInstallPromptEvent, "prompt" | "userChoice">> = {},
): BeforeInstallPromptEvent {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  return Object.assign(event, {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    ...overrides,
  }) as BeforeInstallPromptEvent;
}

function renderWithProvider() {
  return render(
    <NotificationProvider>
      <PwaInstallControl />
    </NotificationProvider>,
  );
}

describe("PwaInstallControl", () => {
  it("does not render any control if the browser never emits beforeinstallprompt (11.6)", () => {
    renderWithProvider();

    expect(screen.queryByRole("button", { name: /instalar aplicación/i })).not.toBeInTheDocument();
  });

  it("shows the visible control when beforeinstallprompt is captured (11.2)", async () => {
    renderWithProvider();

    window.dispatchEvent(createBeforeInstallPromptEvent());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /instalar aplicación/i })).toBeInTheDocument();
    });
  });

  it("on activation, invokes prompt() and shows the result when installation is accepted (11.3)", async () => {
    renderWithProvider();
    const event = createBeforeInstallPromptEvent({
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    window.dispatchEvent(event);

    const button = await screen.findByRole("button", { name: /instalar aplicación/i });
    const user = userEvent.setup();
    await user.click(button);

    expect(event.prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText("Instalación completada")).toBeInTheDocument();
    });
  });

  it("on activation, shows the result when installation is cancelled (11.3)", async () => {
    renderWithProvider();
    const event = createBeforeInstallPromptEvent({
      userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" }),
    });
    window.dispatchEvent(event);

    const button = await screen.findByRole("button", { name: /instalar aplicación/i });
    const user = userEvent.setup();
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Instalación cancelada")).toBeInTheDocument();
    });
  });

  it("consumes the captured event only once: after installing, hides the control until a new beforeinstallprompt", async () => {
    renderWithProvider();
    const event = createBeforeInstallPromptEvent({
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    window.dispatchEvent(event);

    const button = await screen.findByRole("button", { name: /instalar aplicación/i });
    const user = userEvent.setup();
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("Instalación completada")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /instalar aplicación/i })).not.toBeInTheDocument();

    // A second `beforeinstallprompt` re-enables the control.
    const secondEvent = createBeforeInstallPromptEvent();
    window.dispatchEvent(secondEvent);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /instalar aplicación/i })).toBeInTheDocument();
    });
  });
});
