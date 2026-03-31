import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { AuthContainerProvider } from "./auth-container-context";

const mockInitialize = jest.fn();

jest.mock("../auth-container", () => ({
  AuthContainer: jest.fn().mockImplementation(() => ({
    initialize: mockInitialize,
  })),
}));

describe("AuthContainerProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialize.mockResolvedValue(undefined);
  });

  it("renders children after container initialization", async () => {
    const { queryByTestId } = render(
      <AuthContainerProvider>
        <Text testID="child">ready</Text>
      </AuthContainerProvider>
    );

    expect(queryByTestId("child")).toBeNull();

    await waitFor(() => {
      expect(queryByTestId("child")).not.toBeNull();
    });

    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });
});
