import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";
import * as ExpoSecureStore from "expo-secure-store";
import { PeerKeyService, type SignedCredential } from "../peer-key-service";

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("../../api/client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

import { apiClient } from "../../api/client";

function makeFutureDate(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString();
}

function makePastDate(msAgo = 1000): string {
  return new Date(Date.now() - msAgo).toISOString();
}

/** Build a real Ed25519-signed credential using a test server keypair. */
function makeSignedCredential(
  serverSigningKey: Uint8Array,
  overrides: Partial<SignedCredential> = {}
): SignedCredential {
  const cred: Omit<SignedCredential, "signature"> = {
    peerId: overrides.peerId ?? "peer-123",
    ecdhPublicKey: overrides.ecdhPublicKey ?? encodeBase64(new Uint8Array(32).fill(5)),
    issuedAt: overrides.issuedAt ?? new Date(Date.now() - 10_000).toISOString(),
    expiresAt: overrides.expiresAt ?? makeFutureDate(3_600_000),
  };
  const payload = `${cred.peerId}:${cred.ecdhPublicKey}:${cred.issuedAt}:${cred.expiresAt}`;
  const messageBytes = new TextEncoder().encode(payload);
  const signature = nacl.sign.detached(messageBytes, serverSigningKey);
  return { ...cred, signature: encodeBase64(signature) };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("PeerKeyService", () => {
  let service: PeerKeyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PeerKeyService();
  });

  // ── Initial state ────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("getCredential() returns undefined before any initialization", () => {
      expect(service.getCredential()).toBeUndefined();
    });

    it("getMySecretKey() returns undefined before any initialization", () => {
      expect(service.getMySecretKey()).toBeUndefined();
    });

    it("getMyPublicKey() returns undefined before any initialization", () => {
      expect(service.getMyPublicKey()).toBeUndefined();
    });

    it("isCredentialExpiringSoon() returns true when no credential exists", () => {
      expect(service.isCredentialExpiringSoon()).toBe(true);
    });
  });

  // ── verifyPeerCredential ────────────────────────────────────────────────

  describe("verifyPeerCredential", () => {
    it("returns false for an expired credential", () => {
      const expiredCred: SignedCredential = {
        peerId: "peer-1",
        ecdhPublicKey: encodeBase64(new Uint8Array(32)),
        issuedAt: makePastDate(120_000),
        expiresAt: makePastDate(60_000),
        signature: encodeBase64(new Uint8Array(64)),
      };

      expect(service.verifyPeerCredential(expiredCred)).toBe(false);
    });

    it("returns true for a valid credential when no server verify key is configured", () => {
      const cred: SignedCredential = {
        peerId: "peer-1",
        ecdhPublicKey: encodeBase64(new Uint8Array(32)),
        issuedAt: new Date().toISOString(),
        expiresAt: makeFutureDate(3_600_000),
        signature: encodeBase64(new Uint8Array(64)),
      };

      // Without a server verify key the signature check is skipped — only expiry matters.
      expect(service.verifyPeerCredential(cred)).toBe(true);
    });

    it("returns false for an invalid Ed25519 signature when server verify key is set", () => {
      const serverKeys = nacl.sign.keyPair();
      service.setServerVerifyKey(serverKeys.publicKey);

      const tamperedCred: SignedCredential = {
        peerId: "peer-1",
        ecdhPublicKey: encodeBase64(new Uint8Array(32)),
        issuedAt: new Date().toISOString(),
        expiresAt: makeFutureDate(3_600_000),
        signature: encodeBase64(new Uint8Array(64).fill(0)), // garbage signature
      };

      expect(service.verifyPeerCredential(tamperedCred)).toBe(false);
    });

    it("returns true for a correctly signed credential when server verify key is set", () => {
      const serverKeys = nacl.sign.keyPair();
      service.setServerVerifyKey(serverKeys.publicKey);

      const cred = makeSignedCredential(serverKeys.secretKey);

      expect(service.verifyPeerCredential(cred)).toBe(true);
    });
  });

  // ── isCredentialExpiringSoon ────────────────────────────────────────────

  describe("isCredentialExpiringSoon", () => {
    it("returns true before any credential is set (no credential)", () => {
      expect(service.isCredentialExpiringSoon(60_000)).toBe(true);
    });

    it("returns false when registered credential expires well beyond the threshold", async () => {
      const serverKeys = nacl.sign.keyPair();
      service.setServerVerifyKey(serverKeys.publicKey);

      const freshCred = makeSignedCredential(serverKeys.secretKey, {
        expiresAt: makeFutureDate(3_600_000), // expires in 1 hour
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          peer_id: freshCred.peerId,
          ecdh_public_key: freshCred.ecdhPublicKey,
          issued_at: freshCred.issuedAt,
          expires_at: freshCred.expiresAt,
          signature: freshCred.signature,
        }),
      });

      const keyPair = nacl.box.keyPair();
      await service.initFromSecretKey(keyPair.secretKey, "http://localhost:8000", "token", "peer-123");

      expect(service.isCredentialExpiringSoon()).toBe(false);
    });

    it("returns true when the explicit threshold exceeds the time remaining on the credential", async () => {
      const serverKeys = nacl.sign.keyPair();
      service.setServerVerifyKey(serverKeys.publicKey);

      const nearExpiryCred = makeSignedCredential(serverKeys.secretKey, {
        expiresAt: makeFutureDate(30_000), // expires in 30s
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          peer_id: nearExpiryCred.peerId,
          ecdh_public_key: nearExpiryCred.ecdhPublicKey,
          issued_at: nearExpiryCred.issuedAt,
          expires_at: nearExpiryCred.expiresAt,
          signature: nearExpiryCred.signature,
        }),
      });

      const keyPair = nacl.box.keyPair();
      await service.initFromSecretKey(keyPair.secretKey, "http://localhost:8000", "token", "peer-123");

      expect(service.isCredentialExpiringSoon(60_000)).toBe(true); // 60s threshold > 30s remaining
    });
  });

  // ── initGuestKey ─────────────────────────────────────────────────────────

  describe("initGuestKey", () => {
    it("generates a new keypair and saves it when SecureStore has no key", async () => {
      (ExpoSecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      await service.initGuestKey();

      expect(service.getMySecretKey()).toBeDefined();
      expect(service.getMyPublicKey()).toBeDefined();
      expect(service.getMySecretKey()!.length).toBe(32);
      expect(ExpoSecureStore.setItemAsync).toHaveBeenCalledWith(
        "guest_ecdh_secret_key",
        expect.any(String)
      );
    });

    it("loads existing keypair from SecureStore when key is present", async () => {
      const existingKeyPair = nacl.box.keyPair();
      (ExpoSecureStore.getItemAsync as jest.Mock).mockResolvedValue(
        encodeBase64(existingKeyPair.secretKey)
      );

      await service.initGuestKey();

      expect(service.getMySecretKey()).toEqual(existingKeyPair.secretKey);
      expect(service.getMyPublicKey()).toEqual(existingKeyPair.publicKey);
      expect(ExpoSecureStore.setItemAsync).not.toHaveBeenCalled();
    });

    it("handles SecureStore failure gracefully without throwing", async () => {
      (ExpoSecureStore.getItemAsync as jest.Mock).mockRejectedValue(
        new Error("SecureStore unavailable")
      );

      await expect(service.initGuestKey()).resolves.toBeUndefined();
    });
  });

  // ── fetchAndDecryptContactKeys ────────────────────────────────────────────

  describe("fetchAndDecryptContactKeys", () => {
    const masterKey = new Uint8Array(32).fill(9);
    const accessToken = "test-token";
    const apiBaseUrl = "http://localhost:8000";

    it("returns empty map when fetch fails", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

      const result = await service.fetchAndDecryptContactKeys(masterKey, accessToken, apiBaseUrl);

      expect(result.size).toBe(0);
    });

    it("returns empty map when server returns non-ok response", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

      const result = await service.fetchAndDecryptContactKeys(masterKey, accessToken, apiBaseUrl);

      expect(result.size).toBe(0);
    });

    it("decrypts and returns contact keys from server", async () => {
      const peerPublicKey = new Uint8Array(32).fill(7);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const ciphertext = nacl.secretbox(peerPublicKey, nonce, masterKey);
      const blob = encodeBase64(new Uint8Array([...nonce, ...ciphertext]));

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ peer_id: "peer-abc", encrypted_public_key: blob }],
      });

      const result = await service.fetchAndDecryptContactKeys(masterKey, accessToken, apiBaseUrl);

      expect(result.size).toBe(1);
      expect(result.get("peer-abc")).toEqual(peerPublicKey);
    });

    it("skips entries that cannot be decrypted with the provided master key", async () => {
      const wrongMasterKey = new Uint8Array(32).fill(99);
      const peerPublicKey = new Uint8Array(32).fill(7);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const ciphertext = nacl.secretbox(peerPublicKey, nonce, wrongMasterKey);
      const blob = encodeBase64(new Uint8Array([...nonce, ...ciphertext]));

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ peer_id: "peer-xyz", encrypted_public_key: blob }],
      });

      const result = await service.fetchAndDecryptContactKeys(masterKey, accessToken, apiBaseUrl);

      expect(result.size).toBe(0);
    });
  });

  // ── fetchPeerPublicKey ────────────────────────────────────────────────────

  describe("fetchPeerPublicKey", () => {
    it("returns null when the API call fails", async () => {
      (apiClient.get as jest.Mock).mockRejectedValue(new Error("network error"));

      const result = await service.fetchPeerPublicKey("peer-1");

      expect(result).toBeNull();
    });

    it("returns null when credential fails verification", async () => {
      const serverKeys = nacl.sign.keyPair();
      service.setServerVerifyKey(serverKeys.publicKey);

      // Credential signed with a different server key — verification will fail
      const otherKeys = nacl.sign.keyPair();
      const badCred = makeSignedCredential(otherKeys.secretKey);

      (apiClient.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: {
          peer_id: badCred.peerId,
          ecdh_public_key: badCred.ecdhPublicKey,
          issued_at: badCred.issuedAt,
          expires_at: badCred.expiresAt,
          signature: badCred.signature,
        },
      });

      const result = await service.fetchPeerPublicKey("peer-1");

      expect(result).toBeNull();
    });

    it("returns decoded public key when credential is valid", async () => {
      const serverKeys = nacl.sign.keyPair();
      service.setServerVerifyKey(serverKeys.publicKey);

      const cred = makeSignedCredential(serverKeys.secretKey);

      (apiClient.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: {
          peer_id: cred.peerId,
          ecdh_public_key: cred.ecdhPublicKey,
          issued_at: cred.issuedAt,
          expires_at: cred.expiresAt,
          signature: cred.signature,
        },
      });

      const result = await service.fetchPeerPublicKey("peer-123");

      expect(result).toBeInstanceOf(Uint8Array);
    });
  });
});
