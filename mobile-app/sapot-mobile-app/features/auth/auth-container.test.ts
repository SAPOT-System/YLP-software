import { authLog } from "../shared/utils/logger";
import { AuthContainer } from "./auth-container";

jest.mock("../shared", () => {
  const mockPeerRepository = jest.fn();
  const mockPeerService = jest.fn();
  const mockSessionStore = jest.fn();
  const mockUserStore = jest.fn();
  const mockGuestUserRepository = jest.fn();
  const mockUserService = jest.fn();

  return {
    database: { name: "db" },
    PeerRepository: mockPeerRepository,
    PeerService: mockPeerService,
    SessionStore: mockSessionStore,
    UserStore: mockUserStore,
    GuestUserRepository: mockGuestUserRepository,
    UserService: mockUserService,
  };
});

describe("AuthContainer", () => {
  it("constructs dependencies", () => {
    const shared = require("../shared");

    const container = new AuthContainer();

    expect(shared.SessionStore).toHaveBeenCalledTimes(1);
    expect(shared.PeerRepository).toHaveBeenCalledWith(shared.database);
    expect(shared.PeerService).toHaveBeenCalledTimes(1);
    expect(shared.UserStore).toHaveBeenCalledTimes(1);
    expect(shared.GuestUserRepository).toHaveBeenCalledWith(shared.database);
    expect(shared.UserService).toHaveBeenCalledTimes(1);
    expect(container).toBeInstanceOf(AuthContainer);
  });

  it("returns same initialize promise across calls", async () => {
    const container = new AuthContainer();
    const logSpy = jest.spyOn(authLog, "info");

    const p1 = container.initialize();
    const p2 = container.initialize();

    await expect(p1).resolves.toBeUndefined();
    await expect(p2).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
