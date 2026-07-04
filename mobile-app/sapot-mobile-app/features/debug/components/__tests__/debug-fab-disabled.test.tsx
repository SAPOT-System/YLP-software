import { render } from "@testing-library/react-native";
import React from "react";
import { DebugFab } from "../debug-fab";

jest.mock("@/config/debug", () => ({ IS_DEBUG_ENABLED: false }));

describe("DebugFab when debug mode is disabled", () => {
  it("renders nothing", () => {
    const { toJSON } = render(<DebugFab />);

    expect(toJSON()).toBeNull();
  });
});
