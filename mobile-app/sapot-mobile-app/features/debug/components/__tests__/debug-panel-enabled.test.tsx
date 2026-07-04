import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { debugPanelStore } from "../../stores/debug-panel-store";
import { DebugPanel } from "../debug-panel";

jest.mock("@/config/debug", () => ({ IS_DEBUG_ENABLED: true }));

jest.mock("@/features/shared/core/context", () => ({
  useAppMode: () => ({ mode: "lan" }),
  useServerStatus: () => ({ online: true, latency: null, shouldWarn: false }),
}));

jest.mock("@/features/shared/hooks", () => ({
  useUserStore: () => ({ user: { id: "peer-123" } }),
}));

jest.mock("react-native-paper", () => {
  const { Pressable, Text: RNText, View } = require("react-native");

  const MockModal = ({
    visible,
    children,
  }: {
    visible: boolean;
    children: React.ReactNode;
  }) => (visible ? <View accessibilityLabel="debug-panel-modal">{children}</View> : null);

  const MockList = ({
    title,
    onPress,
  }: {
    title: string;
    onPress: () => void;
  }) => (
    <Pressable onPress={onPress}>
      <RNText>{title}</RNText>
    </Pressable>
  );
  (MockList as unknown as { Item: typeof MockList }).Item = MockList;
  (MockList as unknown as { Icon: () => null }).Icon = () => null;

  return {
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Modal: MockModal,
    Divider: () => null,
    IconButton: ({ onPress }: { onPress: () => void }) => (
      <Pressable testID="close-button" onPress={onPress}>
        <RNText>close</RNText>
      </Pressable>
    ),
    Button: ({
      children,
      disabled,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
    }) => (
      <RNText accessibilityState={{ disabled }}>{children}</RNText>
    ),
    List: MockList,
    Text: RNText,
    useTheme: () => ({ colors: { surface: "#fff", onSurfaceVariant: "#888" } }),
  };
});

describe("DebugPanel when debug mode is enabled", () => {
  afterEach(() => {
    debugPanelStore.close();
  });

  it("renders nothing while closed", () => {
    const { toJSON } = render(<DebugPanel />);

    expect(toJSON()).toBeNull();
  });

  it("shows the header info and section list once opened", () => {
    debugPanelStore.open();

    const { getByText } = render(<DebugPanel />);

    expect(getByText(/peer-123/)).toBeTruthy();
    expect(getByText(/LAN/)).toBeTruthy();
    expect(getByText(/online/)).toBeTruthy();
    expect(getByText("Database")).toBeTruthy();
    expect(getByText("WebRTC")).toBeTruthy();
  });

  it("navigates into a section placeholder and back", () => {
    debugPanelStore.open();

    const { getByText, queryByText } = render(<DebugPanel />);

    fireEvent.press(getByText("Database"));
    expect(getByText("Coming soon.")).toBeTruthy();
    expect(queryByText("WebRTC")).toBeNull();
  });

  it("closes when the close button is pressed", () => {
    debugPanelStore.open();

    const { getByTestId, queryByLabelText } = render(<DebugPanel />);

    fireEvent.press(getByTestId("close-button"));

    expect(queryByLabelText("debug-panel-modal")).toBeNull();
  });
});
