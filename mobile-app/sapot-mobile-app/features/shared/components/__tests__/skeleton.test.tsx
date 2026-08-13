import { render } from "@testing-library/react-native";
import { Skeleton } from "../skeleton";

describe("Skeleton", () => {
  it("renders without crashing with default props", () => {
    const { toJSON } = render(<Skeleton />);
    expect(toJSON()).toBeTruthy();
  });

  it("renders with custom dimensions", () => {
    const { toJSON } = render(
      <Skeleton width="40%" height={38} borderRadius={12} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("passes testID through to its placeholder box", () => {
    expect(render(<Skeleton testID="box" />).getByTestId("box")).toBeTruthy();
  });
});
