import { render } from "@testing-library/react-native";
import React from "react";
import { ScreenHeader } from "../screen-header";

describe("ScreenHeader", () => {
  it("renders the header title", () => {
    const { getByText } = render(<ScreenHeader headerName="Get Started" />);
    expect(getByText("Get Started")).toBeTruthy();
  });
});
