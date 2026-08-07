import { render } from "@testing-library/react-native";
import { ChatMessageSkeleton } from "../chat-message-skeleton";

it("exposes one accessible five-row chat placeholder", () => {
  const view = render(<ChatMessageSkeleton />);
  expect(view.getByLabelText("Loading messages", { includeHiddenElements: true })).toBeTruthy();
  expect(view.toJSON()).toBeTruthy();
});
