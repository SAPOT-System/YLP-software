import { render } from "@testing-library/react-native";
import React from "react";
import MessageList from "../message-list";

jest.mock("@/features/shared", () => {
  return {
    database: {
      get: (table: string) => {
        if (table === "messages") {
          return {
            query: () => ({
              observe: () => [
                {
                  id: "msg-1",
                  content: "Hello",
                  createdAt: new Date("2024-01-01T00:00:00Z"),
                  sender: {
                    observe: () => ({
                      firstName: "Alice",
                      lastName: "Doe",
                      username: "alice",
                    }),
                  },
                }
              ]
            })
          };
        }
        return {
          query: () => ({
            observeWithColumns: () => [{ status: "sent" }]
          })
        };
      }
    },
    Message: { table: "messages" },
    MessageStatus: { table: "message_status" },
    formatDate: () => "Jan 1, 2024",
  };
});

describe("MessageList", () => {
  it("renders messages", () => {
    const { getByText } = render(
      <MessageList conversationId="conversation-1" />
    );

    expect(getByText(/Hello/)).toBeTruthy();
  });
});
