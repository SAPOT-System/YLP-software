import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { useFaultInjector } from "../../hooks/use-fault-injector";
import { OfflineSection } from "../offline-section";

jest.mock("../../hooks/use-fault-injector");

jest.mock("react-native-paper", () => {
  const { Pressable, Text: RNText } = require("react-native");

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
    Switch: ({
      value,
      onValueChange,
      testID,
    }: {
      value: boolean;
      onValueChange: (value: boolean) => void;
      testID?: string;
    }) => (
      <Pressable testID={testID} onPress={() => onValueChange(!value)}>
        <RNText>{value ? "on" : "off"}</RNText>
      </Pressable>
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

describe("OfflineSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseFaultInjector.mockReturnValue({ ...baseHookValue });
  });

  it("renders a toggle for every offline flag", () => {
    const { getByTestId } = render(<OfflineSection onBack={jest.fn()} />);

    expect(getByTestId("toggle-noInternet")).toBeTruthy();
    expect(getByTestId("toggle-lanDown")).toBeTruthy();
    expect(getByTestId("toggle-serverDown")).toBeTruthy();
    expect(getByTestId("toggle-redisDown")).toBeTruthy();
    expect(getByTestId("toggle-authDown")).toBeTruthy();
    expect(getByTestId("toggle-syncDown")).toBeTruthy();
  });

  it("toggles noInternet on when pressed", () => {
    const { getByTestId } = render(<OfflineSection onBack={jest.fn()} />);

    fireEvent.press(getByTestId("toggle-noInternet"));

    expect(baseHookValue.setOfflineFlag).toHaveBeenCalledWith("noInternet", true);
  });

  it("toggles serverDown off when it's already on", () => {
    mockedUseFaultInjector.mockReturnValue({
      ...baseHookValue,
      offlineFlags: { ...baseHookValue.offlineFlags, serverDown: true },
    });
    const { getByTestId } = render(<OfflineSection onBack={jest.fn()} />);

    fireEvent.press(getByTestId("toggle-serverDown"));

    expect(baseHookValue.setOfflineFlag).toHaveBeenCalledWith("serverDown", false);
  });

  it("calls onBack when the back button is pressed", () => {
    const onBack = jest.fn();
    const { getByTestId } = render(<OfflineSection onBack={onBack} />);

    fireEvent.press(getByTestId("back-button"));

    expect(onBack).toHaveBeenCalled();
  });
});
