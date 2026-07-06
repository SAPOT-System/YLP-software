import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { useFaultInjector } from "../../hooks/use-fault-injector";
import { NetworkSection } from "../network-section";

jest.mock("../../hooks/use-fault-injector");

jest.mock("react-native-paper", () => {
  const { Pressable, Text: RNText, TextInput: RNTextInput } = require("react-native");

  return {
    Text: RNText,
    Divider: () => null,
    IconButton: ({
      icon,
      onPress,
    }: {
      icon: string;
      onPress: () => void;
    }) => (
      <Pressable testID={icon === "arrow-left" ? "back-button" : `icon-${icon}`} onPress={onPress}>
        <RNText>{icon}</RNText>
      </Pressable>
    ),
    Button: ({
      children,
      onPress,
      testID,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      testID?: string;
    }) => (
      <Pressable testID={testID} onPress={onPress}>
        <RNText>{children}</RNText>
      </Pressable>
    ),
    TextInput: ({
      testID,
      value,
      onChangeText,
    }: {
      testID?: string;
      value: string;
      onChangeText: (text: string) => void;
    }) => (
      <RNTextInput testID={testID} value={value} onChangeText={onChangeText} />
    ),
    useTheme: () => ({ colors: { onSurfaceVariant: "#888" } }),
  };
});

const mockedUseFaultInjector = useFaultInjector as jest.Mock;

const baseHookValue = {
  offlineFlags: {
    noInternet: false,
    lanDown: false,
    serverDown: false,
    redisDown: false,
    authDown: false,
    syncDown: false,
  },
  networkFaults: {
    tcp: { latencyMs: 0, lossRate: 0, dupRate: 0, corruptRate: 0 },
    ws: { latencyMs: 0, lossRate: 0, dupRate: 0, corruptRate: 0 },
  },
  setOfflineFlag: jest.fn(),
  setNetworkFaults: jest.fn(),
  resetNetworkFaults: jest.fn(),
};

describe("NetworkSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseFaultInjector.mockReturnValue({ ...baseHookValue });
  });

  it("renders latency/loss/dup/corrupt fields for both tcp and ws", () => {
    const { getByTestId } = render(<NetworkSection onBack={jest.fn()} />);

    expect(getByTestId("tcp-latencyMs")).toBeTruthy();
    expect(getByTestId("tcp-lossRate")).toBeTruthy();
    expect(getByTestId("tcp-dupRate")).toBeTruthy();
    expect(getByTestId("tcp-corruptRate")).toBeTruthy();
    expect(getByTestId("ws-latencyMs")).toBeTruthy();
    expect(getByTestId("ws-lossRate")).toBeTruthy();
    expect(getByTestId("ws-dupRate")).toBeTruthy();
    expect(getByTestId("ws-corruptRate")).toBeTruthy();
  });

  it("updates tcp latency via setNetworkFaults", () => {
    const { getByTestId } = render(<NetworkSection onBack={jest.fn()} />);

    fireEvent.changeText(getByTestId("tcp-latencyMs"), "300");

    expect(baseHookValue.setNetworkFaults).toHaveBeenCalledWith("tcp", {
      latencyMs: 300,
    });
  });

  it("updates ws loss rate via setNetworkFaults", () => {
    const { getByTestId } = render(<NetworkSection onBack={jest.fn()} />);

    fireEvent.changeText(getByTestId("ws-lossRate"), "0.5");

    expect(baseHookValue.setNetworkFaults).toHaveBeenCalledWith("ws", {
      lossRate: 0.5,
    });
  });

  it("treats a non-numeric value as 0", () => {
    const { getByTestId } = render(<NetworkSection onBack={jest.fn()} />);

    fireEvent.changeText(getByTestId("tcp-dupRate"), "abc");

    expect(baseHookValue.setNetworkFaults).toHaveBeenCalledWith("tcp", {
      dupRate: 0,
    });
  });

  it("resets tcp faults when the tcp reset button is pressed", () => {
    const { getByTestId } = render(<NetworkSection onBack={jest.fn()} />);

    fireEvent.press(getByTestId("reset-tcp"));

    expect(baseHookValue.resetNetworkFaults).toHaveBeenCalledWith("tcp");
  });

  it("resets ws faults when the ws reset button is pressed", () => {
    const { getByTestId } = render(<NetworkSection onBack={jest.fn()} />);

    fireEvent.press(getByTestId("reset-ws"));

    expect(baseHookValue.resetNetworkFaults).toHaveBeenCalledWith("ws");
  });

  it("calls onBack when the back button is pressed", () => {
    const onBack = jest.fn();
    const { getByTestId } = render(<NetworkSection onBack={onBack} />);

    fireEvent.press(getByTestId("back-button"));

    expect(onBack).toHaveBeenCalled();
  });
});
