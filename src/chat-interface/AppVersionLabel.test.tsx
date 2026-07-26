// Unit test for `AppVersionLabel`: a static presentation component, no
// `AppStateContext` dependency needed (unlike `ActiveEngineIndicator`).

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppVersionLabel } from "./AppVersionLabel";
import { APP_VERSION } from "../app-state/appVersion";

describe("AppVersionLabel", () => {
  it("shows the current APP_VERSION prefixed with 'v'", () => {
    render(<AppVersionLabel />);

    expect(screen.getByText(`v${APP_VERSION}`)).toBeInTheDocument();
  });
});
