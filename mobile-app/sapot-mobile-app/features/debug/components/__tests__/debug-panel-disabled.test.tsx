import { render } from "@testing-library/react-native";
import React from "react";
import { DebugPanel } from "../debug-panel";

jest.mock("@/config/debug", () => ({ IS_DEBUG_ENABLED: false }));

describe("DebugPanel when debug mode is disabled", () => {
  it("renders nothing", () => {
    const { toJSON } = render(<DebugPanel />);

    expect(toJSON()).toBeNull();
  });
});
