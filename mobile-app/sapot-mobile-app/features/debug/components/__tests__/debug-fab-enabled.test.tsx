import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { debugPanelStore } from "../../stores/debug-panel-store";
import { DebugFab } from "../debug-fab";

jest.mock("@/config/debug", () => ({ IS_DEBUG_ENABLED: true }));

jest.mock("react-native-paper", () => {
  const { Pressable, Text } = require("react-native");

  return {
    FAB: ({ onPress, testID }: { onPress: () => void; testID?: string }) => (
      <Pressable testID={testID} onPress={onPress}>
        <Text>bug</Text>
      </Pressable>
    ),
  };
});

describe("DebugFab when debug mode is enabled", () => {
  afterEach(() => {
    debugPanelStore.close();
  });

  it("toggles the debug panel open state when pressed", () => {
    const { getByTestId } = render(<DebugFab />);

    fireEvent.press(getByTestId("debug-fab"));

    expect(debugPanelStore.isOpen).toBe(true);
  });
});
