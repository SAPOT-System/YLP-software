import { AnnouncementSeenProvider } from "@/features/announcements/context/announcement-seen-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import React from "react";
import ChatList from "../chat-list";

// Override withObservables to synchronously subscribe to of() observables
jest.mock("@nozbe/watermelondb/react", () => {
  const React = require("react");
  return {
    withObservables:
      (_keys: string[], getProps: (p: unknown) => Record<string, unknown>) =>
      (Component: React.ComponentType<unknown>) =>
      (props: unknown) => {
        const observables =
          typeof getProps === "function" ? getProps(props) : {};
        const extraProps: Record<string, unknown> = {};
        for (const [key, obs] of Object.entries(observables)) {
          if (obs && typeof (obs as { subscribe?: unknown }).subscribe === "function") {
            let value: unknown;
            const sub = (obs as { subscribe: (fn: (v: unknown) => void) => { unsubscribe: () => void } }).subscribe(
              (v: unknown) => { value = v; }
            );
            sub.unsubscribe();
            extraProps[key] = value;
          } else {
            extraProps[key] = obs;
          }
        }
        return React.createElement(Component, { ...(props as object), ...extraProps });
      },
  };
});

jest.mock("@/features/shared", () => {
  const { of } = require("rxjs");

  const mockPeer = {
    id: "peer-1",
    firstName: "Alice",
    lastName: "Doe",
    username: "alice",
  };

  const mockParticipant = {
    id: "part-1",
    _raw: { user: "peer-1" },
    user: { observe: () => of(mockPeer) },
  };

  return {
    database: {
      get: (table: string) => ({
        query: () => ({
          observe: () => {
            if (table === "conversations") {
              return of([{ id: "chat-1", createdAt: new Date("2024-01-01T00:00:00Z") }]);
            }
            if (table === "conversation_participants") {
              return of([mockParticipant]);
            }
            return of([]);
          },
          observeCount: () => of(0),
        }),
      }),
    },
    Conversation: class {},
    ConversationParticipant: class {
      static table = "conversation_participants";
    },
    Message: class {
      static table = "messages";
    },
    MessageStatus: class {
      static table = "message_receipts";
    },
    MessageStatusType: { READ: "read" },
    MessageType: { CALL_LOG: "call_log", FILE: "file" },
    formatDate: () => "Jan 1, 2024",
  };
});

jest.mock("@/features/shared/hooks", () => ({
  useProfilePhoto: () => ({
    url: null,
    loading: false,
    setUrl: jest.fn(),
  }),
}));

jest.mock("@/features/shared/hooks/use-user-store", () => ({
  useUserStore: () => ({
    user: { id: "current-user" },
  }),
}));

describe("ChatList", () => {

  it("renders peer name from reactive observation", async () => {
    const queryClient = new QueryClient();
    const { findByText } = render(
      <QueryClientProvider client={queryClient}>
        <AnnouncementSeenProvider>
          <ChatList />
        </AnnouncementSeenProvider>
      </QueryClientProvider>
    );
    expect(await findByText("Alice Doe")).toBeTruthy();
  });
});
