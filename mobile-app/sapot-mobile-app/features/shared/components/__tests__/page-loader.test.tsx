import { render } from "@testing-library/react-native";
import React from "react";
import { Text, View } from "react-native";
import { PageLoader } from "../page-loader";

jest.mock("react-native-paper", () => ({
  ActivityIndicator: ({ size }: { size?: string }) => {
    const { View: RNView } = require("react-native");
    return <RNView testID="activity-indicator" accessibilityLabel={`spinner-${size ?? "small"}`} />;
  },
  useTheme: () => ({ colors: { primary: "#6200ee" } }),
}));

describe("PageLoader", () => {
  it("renders the large spinner by default", () => {
    const { getByLabelText } = render(<PageLoader />);
    expect(getByLabelText("spinner-large")).toBeTruthy();
  });

  it("renders skeleton content instead of spinner when skeleton prop is provided", () => {
    const skeleton = <View><Text testID="skeleton">Loading skeleton</Text></View>;
    const { getByTestId, queryByLabelText } = render(<PageLoader skeleton={skeleton} />);
    expect(getByTestId("skeleton")).toBeTruthy();
    expect(queryByLabelText("spinner-large")).toBeNull();
  });

  it("applies style prop to the outer container", () => {
    const { getByTestId } = render(<PageLoader style={{ backgroundColor: "red" }} />);
    expect(getByTestId("page-loader-container").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: "red" })])
    );
  });
});
