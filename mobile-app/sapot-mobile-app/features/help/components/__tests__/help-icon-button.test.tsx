import { fireEvent, render } from "@testing-library/react-native";
import { HelpIconButton } from "../help-icon-button";
const mockPush = jest.fn(); jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("react-native-paper", () => {
  const React = require("react");
  const { Pressable } = require("react-native");
  return { IconButton: ({ accessibilityLabel, onPress }: { accessibilityLabel: string; onPress: () => void }) => <Pressable accessibilityLabel={accessibilityLabel} onPress={onPress} /> };
});
it("opens the matching article", () => { const screen = render(<HelpIconButton articleId="calls" />); fireEvent.press(screen.getByLabelText("Help")); expect(mockPush).toHaveBeenCalledWith({ pathname: "/(drawer)/settings/support/help/[id]", params: { id: "calls" } }); });
