import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { AppSnackbar } from "../app-snackbar";

const mockSnackbar = jest.fn();

jest.mock("react-native-paper", () => {
  const React = require("react");
  const { Text, View } = require("react-native");

  return {
    Snackbar: (props: {
      visible: boolean;
      onDismiss: () => void;
      duration?: number;
      theme?: { colors?: Record<string, string> };
      style?: unknown;
      children: React.ReactNode;
    }) => {
      mockSnackbar(props);
      if (!props.visible) {
        return null;
      }

      return (
        <View accessibilityLabel="snackbar">
          <Text>{props.children}</Text>
        </View>
      );
    },
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useTheme: () => ({
      colors: {
        surfaceVariant: "#eeeeee",
        onSurfaceVariant: "#222222",
        errorContainer: "#ffeeee",
        onErrorContainer: "#440000",
      },
    }),
  };
});

describe("AppSnackbar", () => {
  beforeEach(() => {
    mockSnackbar.mockClear();
  });

  it("uses neutral theme colors by default", () => {
    render(
      <AppSnackbar visible onDismiss={jest.fn()}>
        <Text>Saved</Text>
      </AppSnackbar>
    );

    expect(mockSnackbar).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: 3000,
        theme: expect.objectContaining({
          colors: expect.objectContaining({
            inverseSurface: "#eeeeee",
            inverseOnSurface: "#222222",
          }),
        }),
      })
    );
  });

  it("uses error colors when variant is error", () => {
    render(
      <AppSnackbar visible onDismiss={jest.fn()} variant="error">
        <Text>Failed</Text>
      </AppSnackbar>
    );

    expect(mockSnackbar).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({
          colors: expect.objectContaining({
            inverseSurface: "#ffeeee",
            inverseOnSurface: "#440000",
          }),
        }),
      })
    );
  });
});