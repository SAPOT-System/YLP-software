import { render } from "@testing-library/react-native";
import React from "react";
import { LoadingSpinner } from "../loading-spinner";

jest.mock("react-native-paper", () => ({
  ActivityIndicator: ({ size, style }: { size?: string; color?: string; style?: object }) => {
    const { View } = require("react-native");
    return <View testID="activity-indicator" accessibilityLabel={`spinner-${size ?? "small"}`} style={style} />;
  },
  useTheme: () => ({ colors: { primary: "#6200ee" } }),
}));

describe("LoadingSpinner", () => {
  it("renders with default size small", () => {
    const { getByLabelText } = render(<LoadingSpinner />);
    expect(getByLabelText("spinner-small")).toBeTruthy();
  });

  it("renders with size large", () => {
    const { getByLabelText } = render(<LoadingSpinner size="large" />);
    expect(getByLabelText("spinner-large")).toBeTruthy();
  });

  it("applies style prop to the indicator", () => {
    const { getByTestId } = render(<LoadingSpinner style={{ marginTop: 8 }} />);
    const el = getByTestId("activity-indicator");
    expect(el.props.style).toEqual(expect.objectContaining({ marginTop: 8 }));
  });
});
