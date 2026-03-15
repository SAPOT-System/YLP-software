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
});
