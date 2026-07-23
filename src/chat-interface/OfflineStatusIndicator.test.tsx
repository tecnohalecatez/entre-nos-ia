// Unit tests for `OfflineStatusIndicator` (task 19.1).
//
// The browser's connectivity status is simulated by stubbing
// `navigator.onLine` and dispatching `online`/`offline` events on `window`,
// since test environments don't update `navigator.onLine` automatically the
// way a real browser would.
//
// See .kiro/specs/asistente-ia-local/design.md ("Interfaz_Chat") and
// requirements.md (3.8).

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { OfflineStatusIndicator } from "./OfflineStatusIndicator";

function stubOnLine(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OfflineStatusIndicator", () => {
  it("renders nothing while there's a connection (3.8)", () => {
    stubOnLine(true);
    const { container } = render(<OfflineStatusIndicator />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows a visible indicator after going offline (3.8)", () => {
    stubOnLine(true);
    render(<OfflineStatusIndicator />);

    stubOnLine(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByText("Sin conexión")).toBeInTheDocument();
  });

  it("hides the indicator again after regaining the connection", () => {
    stubOnLine(false);
    render(<OfflineStatusIndicator />);

    expect(screen.getByText("Sin conexión")).toBeInTheDocument();

    stubOnLine(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.queryByText("Sin conexión")).not.toBeInTheDocument();
  });
});
