import { render } from "@testing-library/react-native";
import React from "react";

// Mock withObservables to synchronously unwrap simple observables returned
// by the mapping function so the enhanced components receive plain values.
jest.mock("@nozbe/watermelondb/react", () => {
  return {
    withObservables: (_keys: any, mapFn: any) => (Component: any) => (props: any) => {
      const React = require("react");
      const mapped = mapFn(props) || {};
      const resolved: Record<string, any> = {};
      Object.keys(mapped).forEach((k) => {
        const v = mapped[k];
        if (v && typeof v.subscribe === "function") {
          let value: any;
          const sub = v.subscribe((val: any) => (value = val));
          if (sub && typeof sub.unsubscribe === "function") sub.unsubscribe();
          resolved[k] = value;
        } else {
          resolved[k] = v;
        }
      });
      return React.createElement(Component, { ...props, ...resolved });
    },
  };
});
// `of` must be required inside the jest.mock factory to avoid referencing
// out-of-scope variables from the module factory.
// Import `MessageList` after mocks so the module sees mocked dependencies.

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
  const { of } = require("rxjs");
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
            // Return RxJS observables for observes so the
            // withObservables HOC receives expected observable inputs.
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
  it("renders messages", async () => {
    // Require the component after mocks are defined so mocked modules are used.
    const MessageList = require("../message-list").default;

    const { findByText } = render(
      <MessageList conversationId="conversation-1" peerId="peer-1" />
    );

    expect(await findByText(/Hello/)).toBeTruthy();
  });
});
