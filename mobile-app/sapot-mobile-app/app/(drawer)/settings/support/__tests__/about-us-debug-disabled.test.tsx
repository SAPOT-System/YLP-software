import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import AboutUs from "../about-us";

jest.mock("@/config/debug", () => ({ IS_DEBUG_ENABLED: false }));

const mockOpen = jest.fn();
jest.mock("@/features/debug", () => ({
  useDebugPanel: () => ({ open: mockOpen }),
}));

describe("AboutUs version tap opener when debug mode is disabled", () => {
  it("never opens the debug panel regardless of taps", () => {
    const { getByText } = render(<AboutUs />);
    const versionText = getByText(/SAPOT v/);

    for (let i = 0; i < 10; i += 1) {
      fireEvent.press(versionText);
    }

    expect(mockOpen).not.toHaveBeenCalled();
  });
});
