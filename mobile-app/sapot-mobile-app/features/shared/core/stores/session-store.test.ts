import { SessionStore } from "./session-store";

describe("SessionStore", () => {
  describe("userId", () => {
    it("returns user id when initialized", () => {
      const store = new SessionStore();
      store.setUserId("user-1");

      expect(store.userId).toBe("user-1");
    });

    it("throws when session is not initialized", () => {
      const store = new SessionStore();

      expect(() => store.userId).toThrow("Session not initialized");
    });
  });

  describe("setUserId", () => {
    it("accepts undefined to clear session", () => {
      const store = new SessionStore();
      store.setUserId("user-1");
      store.setUserId(undefined);

      expect(() => store.userId).toThrow("Session not initialized");
    });
  });
});
