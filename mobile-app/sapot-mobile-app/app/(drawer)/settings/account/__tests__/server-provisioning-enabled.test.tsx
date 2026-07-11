import { render } from "@testing-library/react-native";
import React from "react";

jest.mock("@/config/debug", () => ({
  IS_DEBUG_ENABLED: true,
}));

const mockSetServerIp = jest.fn();
const mockImportCaPem = jest.fn();

jest.mock("@/features/shared/hooks", () => ({
  useCertProvisioningService: () => ({
    setServerIp: mockSetServerIp,
    importCaPem: mockImportCaPem,
    currentFingerprint: jest.fn(),
    reset: jest.fn(),
  }),
  useMainContainer: () => ({
    zeroconfAdapter: {
      on: jest.fn(),
      removeListener: jest.fn(),
      isScanning: jest.fn().mockReturnValue(false),
      scan: jest.fn(),
      restartScan: jest.fn(),
    },
  }),
  useToast: () => ({
    visible: false,
    message: "",
    variant: "neutral",
    showToast: jest.fn(),
    showError: jest.fn(),
    hideToast: jest.fn(),
  }),
}));

jest.mock("@/features/shared/components/app-snackbar", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    AppSnackbar: (props: { children?: React.ReactNode }) =>
      React.createElement(View, null, props.children),
  };
});

jest.mock("react-native-paper", () => {
  const React = require("react");
  const { Text, TextInput, Pressable } = require("react-native");

  return {
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(Text, props, children),
    TextInput: React.forwardRef(
      (props: Record<string, unknown>, ref: unknown) =>
        React.createElement(TextInput, { ...props, ref })
    ),
    Button: ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      accessibilityLabel?: string;
    }) =>
      React.createElement(
        Pressable,
        { onPress, accessibilityLabel },
        React.createElement(Text, null, children)
      ),
    useTheme: () => ({
      colors: { onSurface: "#000000" },
    }),
  };
});

import ServerProvisioningScreen from "../server-provisioning";

describe("ServerProvisioningScreen (enabled)", () => {
  it("renders the CA/IP provisioning form when IS_DEBUG_ENABLED is true", () => {
    const { getByText, getByLabelText } = render(<ServerProvisioningScreen />);

    expect(getByText("Server IP")).toBeTruthy();
    expect(getByLabelText("Server IP address")).toBeTruthy();
    expect(getByLabelText("Import CA (.pem)")).toBeTruthy();
  });
});
