import { AuthContainerContext } from "@/features/auth/context/auth-container-context";
import React from "react";

export interface UserContainerLike {
  userService: { getUser: jest.Mock };
  guestUserRepository: { getCurrentGuestUser: jest.Mock };
  peerService: { findPeerById: jest.Mock };
}

export function createUserContainerValue(
  overrides: Partial<UserContainerLike> = {}
): UserContainerLike {
  return {
    userService: { getUser: jest.fn() },
    guestUserRepository: { getCurrentGuestUser: jest.fn() },
    peerService: { findPeerById: jest.fn() },
    ...overrides,
  };
}

export function createUserContainerWrapper(value: unknown) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <AuthContainerContext.Provider value={value as never}>
        {children}
      </AuthContainerContext.Provider>
    );
  };
}
