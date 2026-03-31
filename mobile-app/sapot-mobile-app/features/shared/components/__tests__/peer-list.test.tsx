import { render } from "@testing-library/react-native";
import React from "react";
import PeerList from "../peer-list";

jest.mock("../../database", () => {
  return {
    database: {
      get: () => ({
        query: () => ({
          observe: () => [
            {
              id: "peer-1",
              username: "alice",
              firstName: "Alice",
              isOnline: true,
            },
            { id: "peer-2", username: "bob", firstName: "Bob", isOnline: false }
          ]
        })
      })
    },
    Peer: class {}
  };
});

describe("PeerList", () => {
  it("renders peers", () => {
    const { getByText } = render(<PeerList />);
    expect(getByText("Peer Active")).toBeTruthy();
    expect(getByText("Alice")).toBeTruthy();
    expect(getByText("Bob")).toBeTruthy();
  });
});
