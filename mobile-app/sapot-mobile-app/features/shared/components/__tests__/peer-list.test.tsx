import { render } from "@testing-library/react-native";
import React from "react";
import PeerList from "../peer-list";

jest.mock("../../database", () => {
  return {
    database: {
      get: () => ({
        query: () => ({
          observe: () => [
            { id: "peer-1", username: "Alice", isOnline: true },
            { id: "peer-2", username: "Bob", isOnline: false }
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
    expect(getByText("Peer List")).toBeTruthy();
    expect(getByText("Alice")).toBeTruthy();
    expect(getByText("Bob")).toBeTruthy();
  });
});
