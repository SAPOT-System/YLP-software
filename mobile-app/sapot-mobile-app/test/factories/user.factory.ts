import { createFactory, createFactoryList } from "../builders/factory.builder";

export interface TestPeer {
  id: string;
  username: string;
  isOnline: boolean;
}

export interface TestGuestUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
}

export const createTestPeer = createFactory<TestPeer>(() => ({
  id: "peer-1",
  username: "peer-user",
  isOnline: false,
}));

export const createTestGuestUser = createFactory<TestGuestUser>(() => ({
  id: "guest-1",
  username: "guest-user",
  firstName: "Guest",
  lastName: "User",
}));

export const createTestPeers = (
  count: number,
  overrides?: Partial<TestPeer> | ((index: number) => Partial<TestPeer>)
) => createFactoryList(createTestPeer, count, overrides);
