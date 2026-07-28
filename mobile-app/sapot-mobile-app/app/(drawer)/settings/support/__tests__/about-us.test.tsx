import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import AboutUs from "../about-us";

jest.mock("@/config/debug", () => ({ IS_DEBUG_ENABLED: true }));

const mockOpen = jest.fn();
jest.mock("@/features/debug", () => ({
  useDebugPanel: () => ({ open: mockOpen }),
}));

describe("AboutUs version tap opener", () => {
  beforeEach(() => {
    mockOpen.mockClear();
  });

  it("opens the debug panel after 5 taps on the version text", () => {
    const { getByText } = render(<AboutUs />);
    const versionText = getByText(/SAPOT v/);

    for (let i = 0; i < 5; i += 1) {
      fireEvent.press(versionText);
    }

    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it("does not open the debug panel before the 5th tap", () => {
    const { getByText } = render(<AboutUs />);
    const versionText = getByText(/SAPOT v/);

    for (let i = 0; i < 4; i += 1) {
      fireEvent.press(versionText);
    }

    expect(mockOpen).not.toHaveBeenCalled();
  });
});
