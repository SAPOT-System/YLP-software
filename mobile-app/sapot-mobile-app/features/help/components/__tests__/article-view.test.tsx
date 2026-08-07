import { render } from "@testing-library/react-native";
import { ArticleView } from "../article-view";
import type { HelpArticle, HelpContext } from "../../types";
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
const ctx: HelpContext = { mode: "lan", isGuest: true, isRescuer: false };
const article: HelpArticle = { title: "Test", summary: "Summary", icon: "help", category: "problems", blocks: [{ type: "paragraph", text: "Visible" }, { type: "paragraph", text: "Hidden", audience: { modes: ["server"] } }, { type: "steps", items: ["First"] }] };
describe("ArticleView", () => { it("filters blocks and renders step numbers", () => { const screen = render(<ArticleView article={article} ctx={ctx} />); expect(screen.getByText("Visible")).toBeTruthy(); expect(screen.queryByText("Hidden")).toBeNull(); expect(screen.getByText("1.")).toBeTruthy(); }); });
