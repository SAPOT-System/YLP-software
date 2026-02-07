import { render } from "@testing-library/react-native";
import React from "react";
import ChatList from "../chat-list";

jest.mock("@/features/shared", () => {
  return {
    database: {
      get: () => ({
        query: () => ({
          observe: () => [
            { id: "chat-1", createdAt: new Date("2024-01-01T00:00:00Z") }
          ]
        })
      })
    },
    Conversation: class {}
  };
});

jest.mock("@/features/shared/hooks", () => ({
  useChatService: () => ({
    findPeerIdByChatId: jest.fn().mockResolvedValue("peer-1")
  }),
  usePeerService: () => ({
    findDiscoveredPeerById: jest.fn().mockReturnValue({
      id: "peer-1",
      ipAddress: "127.0.0.1",
      port: 1234
    })
  }),
  useDiscoveryService: () => ({
    performResendMessagesForPeer: jest.fn().mockResolvedValue(undefined)
  })
}));

describe("ChatList", () => {
  it("renders chats", () => {
    const { getByText } = render(<ChatList />);
    expect(getByText("Chat List")).toBeTruthy();
    expect(getByText(/chat-1/)).toBeTruthy();
  });
});
