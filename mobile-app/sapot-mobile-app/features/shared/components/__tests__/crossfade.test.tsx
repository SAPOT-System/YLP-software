import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { Crossfade } from "../crossfade";

describe("Crossfade", () => {
  it("renders its children", () => {
    const { getByText } = render(
      <Crossfade activeKey="on">
        <Text>mic-on</Text>
      </Crossfade>
    );

    expect(getByText("mic-on")).toBeTruthy();
  });

  it("renders updated children after activeKey changes", () => {
    const { getByText, rerender } = render(
      <Crossfade activeKey="on">
        <Text>mic-on</Text>
      </Crossfade>
    );

    rerender(
      <Crossfade activeKey="off">
        <Text>mic-off</Text>
      </Crossfade>
    );

    expect(getByText("mic-off")).toBeTruthy();
  });
});
