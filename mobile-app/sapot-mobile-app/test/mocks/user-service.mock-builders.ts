import type { GuestUserRepository } from "@/features/shared/peer";
import type { CleanUpService } from "@/features/shared/connection/services/clean-up-service";
import type { PeerService } from "@/features/shared/peer/peer-service";
import type { SessionStore, UserStore } from "@/features/shared/core/stores";

export type UserStoreMock = jest.Mocked<
  Pick<UserStore, "setUser" | "setIsRescuer" | "setIsAdmin"> & {
    user?: unknown;
    isRescuer?: boolean;
    isAdmin?: boolean;
  }
>;

export type SessionStoreMock = jest.Mocked<Pick<SessionStore, "setUserId">> & {
  userId?: string;
};

export type PeerServiceMock = jest.Mocked<
  Pick<
    PeerService,
    | "findPeerById"
    | "createUser"
    | "register"
    | "markOffline"
    | "markOnline"
    | "getAllPeers"
    | "findDiscoveredPeerById"
    | "cleanUp"
  >
>;

export type GuestUserRepositoryMock = jest.Mocked<
  Pick<
    GuestUserRepository,
    | "saveGuestUser"
    | "isGuestUserExist"
    | "getCurrentGuestUser"
    | "deleteAllGuestUser"
  >
>;

export type CleanUpServiceMock = jest.Mocked<Pick<CleanUpService, "cleanUp">>;

export function createUserStoreMock(
  overrides: Partial<UserStoreMock> = {}
): UserStoreMock {
  return {
    user: undefined,
    isRescuer: false,
    isAdmin: false,
    setUser: jest.fn(),
    setIsRescuer: jest.fn(),
    setIsAdmin: jest.fn(),
    ...overrides,
  };
}

export function createSessionStoreMock(
  overrides: Partial<SessionStoreMock> = {}
): SessionStoreMock {
  return {
    userId: undefined,
    setUserId: jest.fn(),
    ...overrides,
  };
}

export function createPeerServiceMock(
  overrides: Partial<PeerServiceMock> = {}
): PeerServiceMock {
  return {
    findPeerById: jest.fn(),
    createUser: jest.fn(),
    register: jest.fn(),
    markOffline: jest.fn(),
    markOnline: jest.fn(),
    getAllPeers: jest.fn(),
    findDiscoveredPeerById: jest.fn(),
    cleanUp: jest.fn(),
    ...overrides,
  };
}

export function createGuestUserRepositoryMock(
  overrides: Partial<GuestUserRepositoryMock> = {}
): GuestUserRepositoryMock {
  return {
    saveGuestUser: jest.fn(),
    isGuestUserExist: jest.fn(),
    getCurrentGuestUser: jest.fn(),
    deleteAllGuestUser: jest.fn(),
    ...overrides,
  };
}

export function createCleanUpServiceMock(
  overrides: Partial<CleanUpServiceMock> = {}
): CleanUpServiceMock {
  return {
    cleanUp: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
