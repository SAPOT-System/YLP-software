import { render } from "@testing-library/react-native";
import { AnnouncementListSkeleton } from "../announcement-list-skeleton";

it("renders one accessible announcements skeleton with four cards", () => {
  const view = render(<AnnouncementListSkeleton />);
  expect(view.getByLabelText("Loading announcements", { includeHiddenElements: true })).toBeTruthy();
  expect(view.getAllByTestId("announcement-skeleton-card", { includeHiddenElements: true })).toHaveLength(4);
});
