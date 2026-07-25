/* eslint-disable @typescript-eslint/no-explicit-any */
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
    messageRepository: {
      onConversationKeySet: jest.fn().mockReturnValue(() => {}),
      decryptMessage: jest.fn((msg: { content?: string }) => msg?.content ?? ""),
    },
    callRepository: {
      queryByConversation: jest.fn().mockResolvedValue([]),
    },
  }),
  useReducedMotion: () => false,
}));

jest.mock("@/features/shared/hooks/use-user-store", () => ({
  useUserStore: () => ({
    user: { id: "current-user" },
  }),
}));

jest.mock("react-native-paper", () => ({
  useTheme: () => ({ dark: false }),
}));

// The `@/features/call` barrel re-exports the whole call feature (WebRTC
// adapters, connection services). Requiring it here costs seconds of module
// load and times out the first test on CI, so stub the one hook we use.
jest.mock("@/features/call", () => ({
  useInformCall: () => jest.fn(),
}));

jest.mock("@/features/shared/core/api/gsm.api", () => ({
  sendSmsToUser: jest.fn().mockResolvedValue({ ok: true }),
}));

// Track query args so tests can assert the newest-first + pagination fix
// for issue #142 (chat only showed the oldest 100 messages).
const messagesQueryCalls: unknown[][] = [];

jest.mock("@/features/shared", () => {
  const { of } = require("rxjs");

  const makeMessage = (id: string, createdAt: string) => ({
    id,
    messageType: "text",
    content: `Content ${id}`,
    createdAt: new Date(createdAt),
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
  });

  // Newest-first order, matching a `Q.sortBy("created_at", Q.desc)` query.
  const messagesNewestFirst = [
    makeMessage("msg-2", "2024-01-02T00:00:00Z"),
    makeMessage("msg-1", "2024-01-01T00:00:00Z"),
  ];

  return {
    database: {
      get: (table: string) => {
        return {
          query: (...args: unknown[]) => {
            if (table === "messages") messagesQueryCalls.push(args);
            return {
              // Return RxJS observables for observes so the
              // withObservables HOC receives expected observable inputs.
              observe: () => (table === "messages" ? of(messagesNewestFirst) : of([])),
              observeWithColumns: () => of([{ status: "sent" }]),
            };
          },
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
  let MessageList: any;

  // Requiring the component pulls in the React Native / Expo module graph,
  // which costs over a second locally and far more on a loaded CI runner.
  // Do it once in setup, with its own budget, so each test keeps the default
  // per-test timeout instead of the first one absorbing the module load.
  beforeAll(() => {
    // Require the component after mocks are defined so mocked modules are used.
    MessageList = require("../message-list").default;
  }, 60000);

  beforeEach(() => {
    messagesQueryCalls.length = 0;
  });

  it("renders messages", async () => {
    const { findByText } = render(
      <MessageList conversationId="conversation-1" peerId="peer-1" />
    );

    expect(await findByText(/Content msg-2/)).toBeTruthy();
  });

  it("queries messages newest-first so recent messages are never excluded (issue #142)", async () => {
    const { Q } = require("@nozbe/watermelondb");

    const { findByText } = render(
      <MessageList conversationId="conversation-1" peerId="peer-1" />
    );
    await findByText(/Content msg-2/);

    expect(messagesQueryCalls.length).toBeGreaterThan(0);
    const [, sortClause] = messagesQueryCalls[0];
    expect(sortClause).toEqual(Q.sortBy("created_at", Q.desc));
  });

  it("opens a conversation on the newest message", async () => {
    const { findByText, getAllByText } = render(
      <MessageList conversationId="conversation-1" peerId="peer-1" />
    );
    await findByText(/Content msg-2/);

    const rendered = getAllByText(/Content msg-/);
    expect(rendered).toHaveLength(2);
    expect(rendered[0].props.children).toContain("msg-2");
    expect(rendered[1].props.children).toContain("msg-1");
  });
});
