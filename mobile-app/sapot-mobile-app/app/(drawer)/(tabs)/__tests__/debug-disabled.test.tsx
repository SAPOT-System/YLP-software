import { render } from "@testing-library/react-native";
import React from "react";
import Debug from "../debug";

jest.mock("@/config/debug", () => ({ IS_DEBUG_ENABLED: false }));

jest.mock("@/features/chat", () => ({
  useChatService: () => ({
    deleteAllConversations: jest.fn(),
    getAllParticipants: jest.fn(),
    getAllStatus: jest.fn(),
  }),
}));

jest.mock("@/features/shared/hooks", () => ({
  useDatabase: () => ({
    createPeer: jest.fn(),
    showPeers: jest.fn(),
    deletePeers: jest.fn(),
    deleteDatabase: jest.fn(),
  }),
}));

jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require("react-native");
    return <Text testID="redirect">{href}</Text>;
  },
}));

describe("Debug screen when debug mode is disabled", () => {
  it("redirects away instead of rendering the debug tools", () => {
    const { getByTestId, queryByText } = render(<Debug />);

    expect(getByTestId("redirect").props.children).toBe("/(drawer)/(tabs)");
    expect(queryByText("Create Peer")).toBeNull();
  });
});
