import { render } from "@testing-library/react-native";
import { SkeletonText } from "../skeleton-text";

describe("SkeletonText", () => {
  it("renders the requested number of lines with a narrow final line", () => {
    const { getAllByTestId } = render(<SkeletonText lines={3} lastLineWidth="60%" />);
    const lines = getAllByTestId("skeleton-text-line");
    expect(lines).toHaveLength(3);
    expect(lines[2].props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: "60%" })]));
  });
});
