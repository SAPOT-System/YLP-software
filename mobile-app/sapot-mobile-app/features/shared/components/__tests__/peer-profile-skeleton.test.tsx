import { render } from "@testing-library/react-native";
import { PeerProfileSkeleton } from "../peer-profile-skeleton";

it("exposes one profile loading progressbar", () => {
  expect(render(<PeerProfileSkeleton />).getByLabelText("Loading profile", { includeHiddenElements: true })).toBeTruthy();
});
