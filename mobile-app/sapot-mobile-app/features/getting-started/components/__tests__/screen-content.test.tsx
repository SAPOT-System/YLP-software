import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { ScreenContent } from "../screen-content";

describe("ScreenContent", () => {
  it("renders title, description, and children", () => {
    const { getByText } = render(
      <ScreenContent title="Welcome" description="Hello there">
        <Text>Child content</Text>
      </ScreenContent>
    );

    expect(getByText("Welcome")).toBeTruthy();
    expect(getByText("Hello there")).toBeTruthy();
    expect(getByText("Child content")).toBeTruthy();
  });
});
