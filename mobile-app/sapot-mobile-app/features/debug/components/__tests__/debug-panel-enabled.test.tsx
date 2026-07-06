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
  useToast: () => ({
    visible: false,
    message: "",
    variant: "neutral",
    showToast: jest.fn(),
    showError: jest.fn(),
    hideToast: jest.fn(),
  }),
}));

jest.mock("@/features/shared/components/app-snackbar", () => ({
  AppSnackbar: () => null,
}));

const mockResetDatabase = jest.fn();
jest.mock("../../services/debug-db-service", () => ({
  debugDbService: { resetDatabase: () => mockResetDatabase() },
}));

jest.mock("../../hooks/use-debug-db", () => ({
  useDebugDb: () => ({
    tables: [],
    selectedTable: null,
    rows: [],
    loading: false,
    selectTable: jest.fn(),
    clearSelection: jest.fn(),
    deleteRow: jest.fn(),
    resetDatabase: jest.fn(),
    seedPeers: jest.fn(),
    exportToJson: jest.fn().mockResolvedValue("{}"),
    importFromJson: jest.fn(),
  }),
}));

jest.mock("../../hooks/use-debug-auth", () => ({
  useDebugAuth: () => ({
    snapshot: {
      userId: "peer-123",
      username: "alice",
      isGuest: false,
      isRescuer: false,
      isAdmin: false,
      hasAccessToken: false,
    },
    loading: false,
    seedTestUser: jest.fn(),
    setRole: jest.fn(),
    injectFakeAccessToken: jest.fn(),
    clearAccessToken: jest.fn(),
    forceLogout: jest.fn(),
    resetAuthState: jest.fn(),
  }),
}));

jest.mock("../../hooks/use-fault-injector", () => ({
  useFaultInjector: () => ({
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
  }),
}));

jest.mock("react-native-paper", () => {
  const {
    Pressable,
    Text: RNText,
    TextInput: RNTextInput,
    View,
  } = require("react-native");

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
      onPress,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
      onPress?: () => void;
    }) => (
      <Pressable
        disabled={disabled}
        accessibilityState={{ disabled }}
        onPress={onPress}
      >
        <RNText>{children}</RNText>
      </Pressable>
    ),
    List: MockList,
    Text: RNText,
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
    TextInput: ({
      testID,
      value,
      onChangeText,
    }: {
      testID?: string;
      value: string;
      onChangeText: (text: string) => void;
    }) => <RNTextInput testID={testID} value={value} onChangeText={onChangeText} />,
    useTheme: () => ({ colors: { surface: "#fff", onSurfaceVariant: "#888" } }),
  };
});

describe("DebugPanel when debug mode is enabled", () => {
  afterEach(() => {
    debugPanelStore.close();
    mockResetDatabase.mockClear();
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

    fireEvent.press(getByText("WebRTC"));
    expect(getByText("Coming soon.")).toBeTruthy();
    expect(queryByText("Database")).toBeNull();
  });

  it("navigates into the Database section instead of the placeholder", () => {
    debugPanelStore.open();

    const { getByText, queryByText } = render(<DebugPanel />);

    fireEvent.press(getByText("Database"));

    expect(queryByText("Coming soon.")).toBeNull();
    expect(queryByText("WebRTC")).toBeNull();
  });

  it("navigates into the Auth section instead of the placeholder", () => {
    debugPanelStore.open();

    const { getByText, queryByText } = render(<DebugPanel />);

    fireEvent.press(getByText("Auth"));

    expect(queryByText("Coming soon.")).toBeNull();
    expect(getByText(/alice/)).toBeTruthy();
  });

  it("navigates into the Auth section from the Users entry too", () => {
    debugPanelStore.open();

    const { getByText, queryByText } = render(<DebugPanel />);

    fireEvent.press(getByText("Users"));

    expect(queryByText("Coming soon.")).toBeNull();
    expect(getByText(/alice/)).toBeTruthy();
  });

  it("navigates into the Offline section instead of the placeholder", () => {
    debugPanelStore.open();

    const { getByText, getByTestId, queryByText } = render(<DebugPanel />);

    fireEvent.press(getByText("Offline"));

    expect(queryByText("Coming soon.")).toBeNull();
    expect(getByTestId("toggle-noInternet")).toBeTruthy();
  });

  it("navigates into the Network section instead of the placeholder", () => {
    debugPanelStore.open();

    const { getByText, getByTestId, queryByText } = render(<DebugPanel />);

    fireEvent.press(getByText("Network"));

    expect(queryByText("Coming soon.")).toBeNull();
    expect(getByTestId("tcp-latencyMs")).toBeTruthy();
  });

  it("enables the Reset DB quick action and wires it to debugDbService", () => {
    debugPanelStore.open();

    const { getByText } = render(<DebugPanel />);

    fireEvent.press(getByText("Reset DB"));

    expect(mockResetDatabase).toHaveBeenCalledTimes(1);
  });

  it("leaves other quick actions disabled", () => {
    debugPanelStore.open();

    const { getByText } = render(<DebugPanel />);

    fireEvent.press(getByText("Skip login"));

    expect(mockResetDatabase).not.toHaveBeenCalled();
  });

  it("closes when the close button is pressed", () => {
    debugPanelStore.open();

    const { getByTestId, queryByLabelText } = render(<DebugPanel />);

    fireEvent.press(getByTestId("close-button"));

    expect(queryByLabelText("debug-panel-modal")).toBeNull();
  });
});
