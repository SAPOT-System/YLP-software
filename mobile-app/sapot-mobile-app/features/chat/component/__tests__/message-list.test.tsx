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
                  createdAt: new Date("2024-01-01T00:00:00Z")
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
    MessageStatus: { table: "message_status" }
  };
});

describe("MessageList", () => {
  it("renders messages", () => {
    const { getByText } = render(
      <MessageList conversationId="conversation-1" />
    );

    expect(getByText("Message List")).toBeTruthy();
    expect(getByText(/Hello/)).toBeTruthy();
  });
});
