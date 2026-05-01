import { render } from "@testing-library/react-native";
import React from "react";
import { of } from "rxjs";
import MessageList from "../message-list";

jest.mock("@/features/chat/hooks/use-chat-service", () => ({
  useChatService: () => ({
    tryResendMessage: jest.fn(),
  }),
}));

jest.mock("@/features/shared/hooks", () => ({
  usePeerService: () => ({
    findDiscoveredPeerById: jest.fn(),
  }),
  useMainContainer: () => ({
    callRepository: {
      queryByConversation: jest.fn().mockResolvedValue([]),
    },
  }),
}));

jest.mock("@/features/shared/hooks/use-user-store", () => ({
  useUserStore: () => ({
    user: { id: "current-user" },
  }),
}));

jest.mock("react-native-paper", () => ({
  useTheme: () => ({ dark: false }),
}));

jest.mock("@/features/shared", () => {
  const message = {
    id: "msg-1",
    messageType: "text",
    content: "Hello",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    conversation: {
      id: "conversation-1",
    },
    sender: {
      id: "peer-1",
      observe: () =>
        of({
          firstName: "Alice",
          lastName: "Doe",
          username: "alice",
        }),
    },
    _raw: {
      sender: null,
    },
  };

  return {
    database: {
      get: (table: string) => {
        return {
          query: () => ({
            observe: () => (table === "messages" ? of([message]) : of([])),
            observeWithColumns: () => of([{ status: "sent" }]),
          }),
        };
      },
    },
    Message: { table: "messages" },
    MessageStatus: { table: "message_status" },
    GuestUser: { table: "guest_user" },
    formatDate: () => "Jan 1, 2024",
  };
});

describe("MessageList", () => {
  it("renders messages", () => {
    const { getByText } = render(
      <MessageList conversationId="conversation-1" peerId="peer-1" />
    );

    expect(getByText(/Hello/)).toBeTruthy();
  });
});
