import { act, render } from "@testing-library/react-native";
import type { ReactNode } from "react";

const mockParams = jest.fn();
const mockUsePeerService = jest.fn();

jest.mock("expo-router", () => ({ useLocalSearchParams: () => mockParams() }));
jest.mock("@/features/shared/hooks", () => ({
  useDelayedLoading: (loading: boolean) => loading,
  usePeerService: () => mockUsePeerService(),
  useProfilePhoto: () => ({ url: null }),
  useReducedMotion: () => false,
}));
jest.mock("react-native-paper", () => ({
  ...(() => {
    const React = require("react");
    const { Text, View } = require("react-native");
    return {
      Avatar: {
        Image: (props: object) => React.createElement(View, props),
        Text: ({ label, ...props }: { label: string }) => React.createElement(View, props, React.createElement(Text, null, label)),
      },
      Text: ({ children, ...props }: { children: ReactNode }) => React.createElement(Text, props, children),
      useTheme: () => ({ colors: { secondary: "#fff" } }),
    };
  })(),
}));

import PeerProfile from "../[id]";

describe("PeerProfile route changes", () => {
  it("clears stale peer content and returns to loading when id changes", async () => {
    mockParams.mockReturnValue({ id: "a" });
    const findPeerById = jest.fn().mockResolvedValue({ firstName: "Alice", lastName: "Smith", username: "alice" });
    mockUsePeerService.mockReturnValue({ findPeerById });
    const view = render(<PeerProfile />);

    await act(async () => { await Promise.resolve(); });
    expect(view.getByText("Alice Smith")).toBeTruthy();

    mockParams.mockReturnValue({ id: "b" });
    findPeerById.mockImplementationOnce(() => new Promise(() => {}));
    view.rerender(<PeerProfile />);

    expect(view.queryByText("Alice Smith")).toBeNull();
    expect(view.getByLabelText("Loading profile", { includeHiddenElements: true })).toBeTruthy();
  });
});
