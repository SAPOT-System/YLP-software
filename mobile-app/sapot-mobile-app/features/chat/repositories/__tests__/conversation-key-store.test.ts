import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";
import { ConversationKeyStore, ECDH_PREFIX } from "../conversation-key-store";

const makeKey = () => nacl.randomBytes(nacl.secretbox.keyLength);

describe("ConversationKeyStore", () => {
  let store: ConversationKeyStore;

  beforeEach(() => {
    store = new ConversationKeyStore();
  });

  describe("getCandidateKeys", () => {
    it("returns empty array when no key has been set", () => {
      expect(store.getCandidateKeys("conv-1")).toEqual([]);
    });

    it("returns the single key set for a conversation", () => {
      const key = makeKey();
      store.setConversationKey("conv-1", key);
      expect(store.getCandidateKeys("conv-1")).toHaveLength(1);
    });

    it("places the most-recent key first", () => {
      const key1 = makeKey();
      const key2 = makeKey();
      store.setConversationKey("conv-1", key1);
      store.setConversationKey("conv-1", key2);
      const candidates = store.getCandidateKeys("conv-1");
      expect(candidates[0]).toEqual(key2);
    });
  });

  describe("key history cap", () => {
    it("retains at most MAX_KEY_HISTORY (5) entries", () => {
      for (let i = 0; i < 7; i++) {
        store.setConversationKey("conv-1", makeKey());
      }
      expect(store.getCandidateKeys("conv-1")).toHaveLength(5);
    });
  });

  describe("deduplication", () => {
    it("setting the same key twice does not grow the history", () => {
      const key = makeKey();
      store.setConversationKey("conv-1", key);
      store.setConversationKey("conv-1", key);
      expect(store.getCandidateKeys("conv-1")).toHaveLength(1);
    });
  });

  describe("clearConversationKeys", () => {
    it("removes all in-memory conversation keys", () => {
      store.setConversationKey("conv-1", makeKey());
      store.clearConversationKeys();
      expect(store.getCandidateKeys("conv-1")).toEqual([]);
    });

    it("does not clear migration guest keys", () => {
      const key = makeKey();
      store.setConversationKey("conv-1", key);
      store.captureGuestKeysForMigration();
      store.clearConversationKeys();
      expect(store.hasMigrationKeys()).toBe(true);
    });
  });

  describe("migration key round-trip", () => {
    it("decrypts a message encrypted with a captured guest key", () => {
      const key = makeKey();
      store.setConversationKey("conv-1", key);
      store.captureGuestKeysForMigration();

      const plaintext = "hello migration";
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const ciphertext = nacl.secretbox(new TextEncoder().encode(plaintext), nonce, key);
      const encrypted = ECDH_PREFIX + encodeBase64(nonce) + ":" + encodeBase64(ciphertext);

      const result = store.tryDecryptWithMigrationKeys(encrypted, "conv-1");
      expect(result).toBe(plaintext);
    });

    it("returns null when migration key is missing for that conversation", () => {
      store.captureGuestKeysForMigration();
      const result = store.tryDecryptWithMigrationKeys(ECDH_PREFIX + "aaa:bbb", "conv-unknown");
      expect(result).toBeNull();
    });

    it("returns content unchanged when it does not start with ECDH_PREFIX", () => {
      store.captureGuestKeysForMigration();
      expect(store.tryDecryptWithMigrationKeys("plain text", "conv-1")).toBe("plain text");
    });
  });

  describe("hasMigrationKeys", () => {
    it("returns false before any capture", () => {
      expect(store.hasMigrationKeys()).toBe(false);
    });

    it("returns true after capturing keys", () => {
      store.setConversationKey("conv-1", makeKey());
      store.captureGuestKeysForMigration();
      expect(store.hasMigrationKeys()).toBe(true);
    });

    it("returns false after clearMigrationKeys", () => {
      store.setConversationKey("conv-1", makeKey());
      store.captureGuestKeysForMigration();
      store.clearMigrationKeys();
      expect(store.hasMigrationKeys()).toBe(false);
    });
  });

  describe("onConversationKeySet listener", () => {
    it("calls listener when a key is set", () => {
      const listener = jest.fn();
      store.onConversationKeySet(listener);
      store.setConversationKey("conv-1", makeKey());
      expect(listener).toHaveBeenCalledWith("conv-1");
    });

    it("unsubscribe stops future notifications", () => {
      const listener = jest.fn();
      const unsubscribe = store.onConversationKeySet(listener);
      unsubscribe();
      store.setConversationKey("conv-1", makeKey());
      expect(listener).not.toHaveBeenCalled();
    });

    it("notifies multiple listeners independently", () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      store.onConversationKeySet(listener1);
      store.onConversationKeySet(listener2);
      store.setConversationKey("conv-2", makeKey());
      expect(listener1).toHaveBeenCalledWith("conv-2");
      expect(listener2).toHaveBeenCalledWith("conv-2");
    });
  });
});
