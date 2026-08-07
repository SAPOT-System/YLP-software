import { render } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { SkeletonGroup } from "../skeleton-group";

describe("SkeletonGroup", () => {
  it("exposes one labelled progressbar and hides descendants", () => {
    const { UNSAFE_getAllByType } = render(<SkeletonGroup><Text>child</Text></SkeletonGroup>);
    const [node] = UNSAFE_getAllByType(View).filter((view) => view.props.accessibilityRole === "progressbar");
    expect(node.props.accessibilityLabel).toBe("Loading");
    expect(node.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(node.props.accessibilityElementsHidden).toBe(true);
  });
});
