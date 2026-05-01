/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

// Provide test-friendly mocks for react-native-paper so ModeSelect can render
jest.mock("react-native-paper", () => {
  const React = require("react");
  const RN = require("react-native");

  const Text = (props: any) => React.createElement(RN.Text, props, props.children);
  const Button = (props: any) => React.createElement(RN.TouchableOpacity, props, props.children);
  const Icon = (_props: any) => React.createElement(RN.View, null, null);
  const IconButton = (props: any) => React.createElement(RN.TouchableOpacity, props, props.children);
  const Portal = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  const Modal = (props: any) => React.createElement(RN.View, props, props.children);

  const TextInput = (props: any) => React.createElement(RN.TextInput, { ...props });
  TextInput.Icon = (_props: any) => React.createElement(RN.View, null, null);

  return {
    __esModule: true,
    Text,
    Button,
    Icon,
    IconButton,
    Portal,
    Modal,
    TextInput,
    useTheme: () => ({
      colors: {
        primary: "#000",
        onPrimaryContainer: "#ccc",
        primaryContainer: "#eee",
        inverseOnSurface: "#000",
        surface: "#fff",
      },
    }),
  };
});

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
