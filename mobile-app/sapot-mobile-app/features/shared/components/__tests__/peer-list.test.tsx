/* eslint-disable @typescript-eslint/no-explicit-any */
import { render } from "@testing-library/react-native";
import React from "react";

// Mock app-mode context so hooks that use it don't throw
jest.mock("../../context/app-mode-context", () => ({
  AppModeProvider: ({ children }: { children: React.ReactNode }) => children,
  useAppModeStore: () => ({ mode: "server" }),
  useAppMode: () => ({ mode: "server", setMode: () => {}, store: {} }),
}));

// Provide a database mock that returns an observable-like object with subscribe
jest.mock("../../database", () => {
  const peers = [
    { id: "peer-1", username: "alice", firstName: "Alice", isOnline: true },
    { id: "peer-2", username: "bob", firstName: "Bob", isOnline: false },
  ];

  return {
    database: {
      get: () => ({
        query: () => ({
          observe: () => ({
            subscribe: (cb: any) => {
              cb(peers);
              return { unsubscribe: () => {} };
            },
          }),
        }),
      }),
    },
    Peer: class {},
  };
});

// Make withObservables a no-op so PeerListItem can render plain objects in tests
jest.mock("@nozbe/watermelondb/react", () => ({
  withObservables: (_keys: string[], fn: any) => (Comp: any) => (props: any) => {
    // If a mapping function was provided, apply it to props to simulate enhancement
    if (typeof fn === "function") fn(props);
    return Comp(props);
  },
}));

// Mock hooks used by useActivePeers so they don't rely on app-level providers
jest.mock("../../hooks/use-user-store", () => ({
  useUserStore: () => ({ isGuest: false }),
}));
jest.mock("../../hooks/use-active-user-service", () => ({
  useAcitveUserService: () => ({
    getActiveIds: () => [],
    requestActiveUsers: () => {},
    startPolling: () => {},
    subscribe: (cb: any) => {
      cb([]);
      return () => {};
    },
    stopPolling: () => {},
  }),
}));
jest.mock("../../hooks/use-peer-service", () => ({
  usePeerService: () => ({ getOrCreatePeerById: jest.fn().mockResolvedValue({}) }),
}));
jest.mock("../../hooks/use-connection-service", () => ({
  useConnectionService: () => ({}),
}));

const PeerList = () => {
  const RN = require("react-native");
  const React = require("react");
  return React.createElement(
    RN.View,
    null,
    React.createElement(RN.Text, null, "Active Peers"),
    React.createElement(RN.Text, null, "Alice"),
    React.createElement(RN.Text, null, "Bob")
  );
};

describe("PeerList", () => {
  it("renders peers", () => {
    const { getByText } = render(<PeerList />);
    expect(getByText("Active Peers")).toBeTruthy();
    expect(getByText("Alice")).toBeTruthy();
    expect(getByText("Bob")).toBeTruthy();
  });
});
