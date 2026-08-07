import { render } from "@testing-library/react-native";
import HelpArticleScreen from "../help/[id]";
let mockParams: { id?: string } = {};
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }), useLocalSearchParams: () => mockParams }));
jest.mock("@/features/help", () => { const actual = jest.requireActual("@/features/help"); return { ...actual, useHelpContext: () => ({ mode: "lan", isGuest: true, isRescuer: false }) }; });
jest.mock("react-native-paper", () => {
  const actual = jest.requireActual("react-native-paper");
  const { Pressable, Text } = require("react-native");
  return { ...actual, Button: ({ children, onPress }: { children: string; onPress: () => void }) => <Pressable onPress={onPress}><Text>{children}</Text></Pressable> };
});
describe("HelpArticleScreen", () => { it("renders articles and handles unavailable routes", () => { mockParams = { id: "calls" }; const known = render(<HelpArticleScreen />); expect(known.getByText("Calls")).toBeTruthy(); known.unmount(); mockParams = { id: "announcements" }; expect(render(<HelpArticleScreen />).getByText(/doesn't apply/i)).toBeTruthy(); }); });
