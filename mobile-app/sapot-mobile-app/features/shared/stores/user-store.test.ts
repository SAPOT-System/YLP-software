import { createTestGuestUser, createTestPeer } from "@/test/factories/user.factory";
import { UserStore } from "./user-store";

describe("UserStore", () => {
  describe("user", () => {
    it("returns user after setUser", () => {
      const store = new UserStore();
      const user = createTestPeer({ id: "user-1", username: "alice" }) as never;

      store.setUser(user, false);

      expect(store.user).toBe(user);
    });

    it("throws when current user is not initialized", () => {
      const store = new UserStore();

      expect(() => store.user).toThrow("Current user not initialized");
    });
  });

  describe("isGuest", () => {
    it("is false by default", () => {
      const store = new UserStore();

      expect(store.isGuest).toBe(false);
    });

    it("is updated when setting a guest user", () => {
      const store = new UserStore();
      const guestUser = createTestGuestUser({ id: "guest-1", username: "guest" }) as never;

      store.setUser(guestUser, true);

      expect(store.isGuest).toBe(true);
      expect(store.user).toBe(guestUser);
    });
  });

  describe("setUser beacon logging", () => {
    beforeEach(() => {
      jest.resetModules();
    });

    afterEach(() => {
      jest.resetModules();
    });

    it("emits user › beacon with userId in development builds", () => {
      jest.doMock("expo-constants", () => ({
        __esModule: true,
        default: { expoConfig: { extra: { appVariant: "development" } } },
      }));
      jest.doMock("../utils/logger", () => ({
        userLog: { debug: jest.fn(), info: jest.fn() },
      }));

      const { UserStore: Store } = require("./user-store");
      const { userLog } = require("../utils/logger");
      const store = new Store();
      const user = createTestPeer({ id: "abc-123", username: "alice" }) as never;

      store.setUser(user, false);

      const beaconCall = (userLog.info as jest.Mock).mock.calls.find(
        ([msg]: [string]) => msg === "user › beacon"
      );
      expect(beaconCall).toBeDefined();
      expect(beaconCall[1]).toEqual({ userId: "abc-123" });
    });

    it("emits user › beacon with userId in preview builds", () => {
      jest.doMock("expo-constants", () => ({
        __esModule: true,
        default: { expoConfig: { extra: { appVariant: "preview" } } },
      }));
      jest.doMock("../utils/logger", () => ({
        userLog: { debug: jest.fn(), info: jest.fn() },
      }));

      const { UserStore: Store } = require("./user-store");
      const { userLog } = require("../utils/logger");
      const store = new Store();
      const user = createTestPeer({ id: "xyz-789", username: "bob" }) as never;

      store.setUser(user, false);

      const beaconCall = (userLog.info as jest.Mock).mock.calls.find(
        ([msg]: [string]) => msg === "user › beacon"
      );
      expect(beaconCall).toBeDefined();
      expect(beaconCall[1]).toEqual({ userId: "xyz-789" });
    });

    it("does not emit user › beacon in production builds", () => {
      jest.doMock("expo-constants", () => ({
        __esModule: true,
        default: { expoConfig: { extra: { appVariant: "production" } } },
      }));
      jest.doMock("../utils/logger", () => ({
        userLog: { debug: jest.fn(), info: jest.fn() },
      }));

      const { UserStore: Store } = require("./user-store");
      const { userLog } = require("../utils/logger");
      const store = new Store();
      const user = createTestPeer({ id: "abc-123", username: "alice" }) as never;

      store.setUser(user, false);

      const beaconCall = (userLog.info as jest.Mock).mock.calls.find(
        ([msg]: [string]) => msg === "user › beacon"
      );
      expect(beaconCall).toBeUndefined();
    });

    it("does not emit user › beacon for guest users in dev builds", () => {
      jest.doMock("expo-constants", () => ({
        __esModule: true,
        default: { expoConfig: { extra: { appVariant: "development" } } },
      }));
      jest.doMock("../utils/logger", () => ({
        userLog: { debug: jest.fn(), info: jest.fn() },
      }));

      const { UserStore: Store } = require("./user-store");
      const { userLog } = require("../utils/logger");
      const store = new Store();
      const guestUser = createTestGuestUser({ id: "guest-1", username: "guest" }) as never;

      store.setUser(guestUser, true);

      const beaconCall = (userLog.info as jest.Mock).mock.calls.find(
        ([msg]: [string]) => msg === "user › beacon"
      );
      expect(beaconCall).toBeUndefined();
    });
  });
});
