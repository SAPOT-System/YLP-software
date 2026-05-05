import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

const mockInitialize = jest.fn();
const mockInitRuntimeOverrides = jest.fn().mockResolvedValue(undefined);
const mockGetApiUrl = jest.fn(() => "http://localhost:8000");
const mockApiClient = {
  defaults: {
    baseURL: "",
  },
};

jest.mock("../auth-container", () => ({
  AuthContainer: jest.fn().mockImplementation(() => ({
    initialize: mockInitialize,
  })),
}));

jest.mock("@/config/runtime", () => ({
  initRuntimeOverrides: mockInitRuntimeOverrides,
  getApiUrl: mockGetApiUrl,
}));

jest.mock("@/features/shared", () => ({
  apiClient: mockApiClient,
}));

describe("AuthContainerProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialize.mockResolvedValue(undefined);
    mockInitRuntimeOverrides.mockResolvedValue(undefined);
    mockGetApiUrl.mockReturnValue("http://localhost:8000");
    mockApiClient.defaults.baseURL = "";
  });

  it("renders children after container initialization", async () => {
    const { AuthContainerProvider } = require("./auth-container-context");

    const { findByTestId, queryByTestId } = render(
      <AuthContainerProvider>
        <Text testID="child">ready</Text>
      </AuthContainerProvider>
    );

    expect(queryByTestId("child")).toBeNull();

    expect(await findByTestId("child")).toBeTruthy();

    expect(mockInitRuntimeOverrides).toHaveBeenCalledTimes(1);
    expect(mockGetApiUrl).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockApiClient.defaults.baseURL).toBe("http://localhost:8000");
  });
});
