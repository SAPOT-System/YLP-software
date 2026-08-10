import { render } from "@testing-library/react-native";
import { ArticleList } from "../article-list";
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../../hooks/use-help-context", () => ({ useHelpContext: () => ({ mode: "lan", isGuest: true, isRescuer: false }) }));
describe("ArticleList", () => { it("filters unavailable article topics", () => { const screen = render(<ArticleList onReplayTour={jest.fn()} />); expect(screen.getByText("Connecting & modes")).toBeTruthy(); expect(screen.queryByText("Announcements")).toBeNull(); expect(screen.queryByText("Map & location")).toBeNull(); }); });
