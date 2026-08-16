import { authLog } from "../shared/core/utils/logger";

// Mock the specific modules AuthContainer imports so construction doesn't hit real DB
jest.mock("../shared/core/database/database", () => ({ database: {} }));
jest.mock("../shared/peer/peer-repository", () => ({
  PeerRepository: jest.fn().mockImplementation(() => ({})),
}));
jest.mock("../shared/peer/peer-service", () => ({
  PeerService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock("../shared/core/stores/session-store", () => ({
  SessionStore: jest.fn().mockImplementation(() => ({})),
}));
jest.mock("../shared/core/stores/user-store", () => ({
  UserStore: jest.fn().mockImplementation(() => ({})),
}));
jest.mock("../shared/peer/guest-user-repository", () => ({
  GuestUserRepository: jest.fn().mockImplementation(() => ({})),
}));
jest.mock("../shared/connection/services/user-service", () => ({
  UserService: jest.fn().mockImplementation(() => ({ initialize: jest.fn() })),
}));
jest.mock("./services/phone-verification-service", () => ({
  PhoneVerificationService: jest.fn().mockImplementation(() => ({})),
}));

describe("AuthContainer", () => {
  it("constructs dependencies", () => {
    const shared = require("../shared");
    const { AuthContainer } = require("./auth-container");

    const container = new AuthContainer();

    expect(shared.SessionStore).toHaveBeenCalledTimes(1);
    expect(shared.PeerRepository).toHaveBeenCalledWith(shared.database);
    expect(shared.PeerService).toHaveBeenCalledTimes(1);
    expect(shared.UserStore).toHaveBeenCalledTimes(1);
    expect(shared.GuestUserRepository).toHaveBeenCalledWith(shared.database);
    expect(shared.UserService).toHaveBeenCalledTimes(1);
    const { PhoneVerificationService } = require("./services/phone-verification-service");
    expect(PhoneVerificationService).toHaveBeenCalledTimes(1);
    expect(container).toBeInstanceOf(AuthContainer);
  });

  it("returns same initialize promise across calls", async () => {
    const { AuthContainer } = require("./auth-container");
    const container = new AuthContainer();
    const logSpy = jest.spyOn(authLog, "info");

    const p1 = container.initialize();
    const p2 = container.initialize();

    await expect(p1).resolves.toBeUndefined();
    await expect(p2).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
