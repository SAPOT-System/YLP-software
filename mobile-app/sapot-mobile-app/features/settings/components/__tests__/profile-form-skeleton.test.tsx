import { render } from "@testing-library/react-native";
import { ProfileFormSkeleton } from "../profile-form-skeleton";

it("renders one accessible profile skeleton with four fields", () => {
  const view = render(<ProfileFormSkeleton />);
  expect(view.getByLabelText("Loading profile", { includeHiddenElements: true })).toBeTruthy();
  expect(view.getAllByTestId("profile-skeleton-field", { includeHiddenElements: true })).toHaveLength(4);
});
