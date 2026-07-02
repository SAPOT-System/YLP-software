import { render } from "@testing-library/react-native";
import React from "react";

jest.mock("@/features/auth", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@/features/shared/core/context", () => ({
  useServerHealth: jest.fn(),
}));

const useAuthMock = () =>
  (jest.requireMock("@/features/auth") as { useAuth: jest.Mock }).useAuth;

const useServerStatusMock = () =>
  (jest.requireMock("@/features/shared/core/context") as { useServerHealth: jest.Mock })
    .useServerHealth;

const makeAuth = (overrides: Record<string, unknown> = {}) => ({
  needsReloginForServer: false,
  isOfflineWithExpiredToken: false,
  isGuest: false,
  transitionReloginToOffline: jest.fn(),
  transitionOfflineToRelogin: jest.fn(),
  ...overrides,
});

describe("ServerDownReloginTransition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthMock().mockReturnValue(makeAuth());
    useServerStatusMock().mockReturnValue({ shouldWarn: false, online: true, latency: null });
  });

  const renderTransition = () => {
    const { ServerDownReloginTransition } =
      require("../server-down-relogin-transition") as typeof import("../server-down-relogin-transition");
    return render(<ServerDownReloginTransition />);
  };

  it("calls transitionReloginToOffline when needsReloginForServer=true and server goes down", () => {
    const transitionReloginToOffline = jest.fn();
    useAuthMock().mockReturnValue(makeAuth({ needsReloginForServer: true, transitionReloginToOffline }));
    useServerStatusMock().mockReturnValue({ shouldWarn: true, online: false, latency: null });

    renderTransition();

    expect(transitionReloginToOffline).toHaveBeenCalledTimes(1);
  });

  it("does not call transitionReloginToOffline when needsReloginForServer=false even if server is down", () => {
    const transitionReloginToOffline = jest.fn();
    useAuthMock().mockReturnValue(makeAuth({ needsReloginForServer: false, transitionReloginToOffline }));
    useServerStatusMock().mockReturnValue({ shouldWarn: true, online: false, latency: null });

    renderTransition();

    expect(transitionReloginToOffline).not.toHaveBeenCalled();
  });

  it("does not call transitionReloginToOffline when server is up even if needsReloginForServer=true", () => {
    const transitionReloginToOffline = jest.fn();
    useAuthMock().mockReturnValue(makeAuth({ needsReloginForServer: true, transitionReloginToOffline }));
    useServerStatusMock().mockReturnValue({ shouldWarn: false, online: true, latency: null });

    renderTransition();

    expect(transitionReloginToOffline).not.toHaveBeenCalled();
  });

  it("renders nothing", () => {
    const { toJSON } = renderTransition();
    expect(toJSON()).toBeNull();
  });

  it("calls transitionOfflineToRelogin when isOfflineWithExpiredToken=true and server comes back online", () => {
    const transitionOfflineToRelogin = jest.fn();
    useAuthMock().mockReturnValue(
      makeAuth({ isOfflineWithExpiredToken: true, transitionOfflineToRelogin })
    );
    useServerStatusMock().mockReturnValue({ shouldWarn: false, online: true, latency: null });

    renderTransition();

    expect(transitionOfflineToRelogin).toHaveBeenCalledTimes(1);
  });

  it("does not call transitionOfflineToRelogin when isOfflineWithExpiredToken=false even if server is online", () => {
    const transitionOfflineToRelogin = jest.fn();
    useAuthMock().mockReturnValue(
      makeAuth({ isOfflineWithExpiredToken: false, transitionOfflineToRelogin })
    );
    useServerStatusMock().mockReturnValue({ shouldWarn: false, online: true, latency: null });

    renderTransition();

    expect(transitionOfflineToRelogin).not.toHaveBeenCalled();
  });

  it("does not call transitionOfflineToRelogin when server is still down", () => {
    const transitionOfflineToRelogin = jest.fn();
    useAuthMock().mockReturnValue(
      makeAuth({ isOfflineWithExpiredToken: true, transitionOfflineToRelogin })
    );
    useServerStatusMock().mockReturnValue({ shouldWarn: true, online: false, latency: null });

    renderTransition();

    expect(transitionOfflineToRelogin).not.toHaveBeenCalled();
  });
});
