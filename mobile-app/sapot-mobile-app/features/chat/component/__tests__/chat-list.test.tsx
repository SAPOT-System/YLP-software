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
    Conversation: class {},
    formatDate: () => "Jan 1, 2024"
  };
});

jest.mock("@/features/shared/hooks", () => ({
  useMainContainer: () => ({
    chatService: {
      findPeerIdByChatId: jest.fn().mockResolvedValue("peer-1")
    },
    peerService: {
      findDiscoveredPeerById: jest.fn().mockReturnValue({
        id: "peer-1",
        ipAddress: "127.0.0.1",
        port: 1234
      })
    },
    discoveryService: {
      performResendMessagesForPeer: jest.fn().mockResolvedValue(undefined)
    }
  }),
  useChatService: () => ({
    findPeerIdByChatId: jest.fn().mockResolvedValue("peer-1")
  }),
  usePeerService: () => ({
    findPeerById: jest.fn().mockResolvedValue({
      id: "peer-1",
      firstName: "Alice",
      lastName: "Doe",
      username: "alice"
    })
  }),
  useDiscoveryService: () => ({
    performResendMessagesForPeer: jest.fn().mockResolvedValue(undefined)
  })
}));

describe("ChatList", () => {
  it("renders chats", async () => {
    const { getByText, findByText } = render(<ChatList />);
    expect(getByText("Chats")).toBeTruthy();
    expect(await findByText("Alice Doe")).toBeTruthy();
  });
});
