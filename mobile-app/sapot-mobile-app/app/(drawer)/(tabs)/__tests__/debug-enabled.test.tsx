import { render } from "@testing-library/react-native";
import React from "react";
import Debug from "../debug";

jest.mock("@/config/debug", () => ({ IS_DEBUG_ENABLED: true }));

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
  Redirect: () => null,
}));

describe("Debug screen when debug mode is enabled", () => {
  it("renders the debug tools", () => {
    const { getByText } = render(<Debug />);

    expect(getByText("Create Peer")).toBeTruthy();
  });
});
