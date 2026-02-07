import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { ModeSelect } from "../mode-select";

describe("ModeSelect", () => {
  it("renders mode details and handles press", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <ModeSelect mode="server" selected onPress={onPress} />
    );

    expect(getByText("Server Mode")).toBeTruthy();
    expect(getByText(/Use the app over the internet/i)).toBeTruthy();

    fireEvent.press(getByText("Server Mode"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
