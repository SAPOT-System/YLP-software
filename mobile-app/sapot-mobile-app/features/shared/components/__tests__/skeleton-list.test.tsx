import { render } from "@testing-library/react-native";
import { View } from "react-native";
import { SkeletonList } from "../skeleton-list";

describe("SkeletonList", () => {
  it("repeats each requested row and passes its index", () => {
    const renderItem = jest.fn((index: number) => <View testID={`row-${index}`} />);
    const { getByTestId } = render(<SkeletonList count={3} gap={20} renderItem={renderItem} />);
    expect(getByTestId("row-2")).toBeTruthy();
    expect(renderItem).toHaveBeenCalledTimes(3);
  });
});
