import { render } from "@testing-library/react-native";
import { SearchResultsSkeleton } from "../search-results-skeleton";

it("renders one accessible results skeleton with six rows", () => {
  const view = render(<SearchResultsSkeleton />);
  expect(view.getByLabelText("Loading results", { includeHiddenElements: true })).toBeTruthy();
  expect(view.getAllByTestId("search-skeleton-row", { includeHiddenElements: true })).toHaveLength(6);
});
