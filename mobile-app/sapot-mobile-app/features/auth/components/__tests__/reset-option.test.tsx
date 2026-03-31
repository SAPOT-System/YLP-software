import { fireEvent, render } from "@testing-library/react-native";
import { router } from "expo-router";
import React from "react";
import { ResetOption } from "../reset-option";

describe("ResetOption", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("navigates to email reset", () => {
    const { getByText } = render(<ResetOption option="email" />);

    fireEvent.press(getByText("Reset via email"));
    expect(router.push).toHaveBeenCalledWith({
      params: { resetOption: "email" },
      pathname: "/auth/forgot-password/enter-identifier",
    });
  });
});
