import { LocalEncryptionService } from "../local-encryption-service";
import { KeyInitError } from "@/features/shared/core/errors";

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("@/config/runtime", () => ({
  getWsUrl: jest.fn(() => "ws://localhost:8000"),
  getApiUrl: jest.fn(() => "http://localhost:8000"),
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("expo-crypto", () => ({
  getRandomBytes: jest.fn((n: number) => new Uint8Array(n).fill(42)),
  getRandomBytesAsync: jest.fn(async (n: number) => new Uint8Array(n).fill(43)),
}));

jest.mock("../../core/stores/secure-config", () => ({
  getMasterKey: jest.fn(),
  saveMasterKey: jest.fn().mockResolvedValue(undefined),
  getSignalingSecretKey: jest.fn(),
  saveSignalingSecretKey: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../key-derivation", () => ({
  deriveKey: jest.fn().mockResolvedValue(new Uint8Array(32).fill(1)),
}));

// Stub the barrel import to avoid the api/client → @/config/runtime chain.
jest.mock("@/features/shared", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

jest.mock("@/features/shared/core/api", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

import * as SecureConfig from "../../core/stores/secure-config";

function mockSecureConfigForGuestPath() {
  (SecureConfig.getMasterKey as jest.Mock).mockResolvedValue(null);
  (SecureConfig.getSignalingSecretKey as jest.Mock).mockResolvedValue(null);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("LocalEncryptionService", () => {
  // ── Before initialization ────────────────────────────────────────────────

  describe("before initialization", () => {
    let service: LocalEncryptionService;

    beforeEach(() => {
      service = new LocalEncryptionService();
    });

    it("encrypt() throws when service is not initialized", () => {
      expect(() => service.encrypt("hello")).toThrow("LocalEncryptionService not initialized");
    });

    it("decrypt() throws when service is not initialized and content has version prefix", () => {
      expect(() => service.decrypt("v1:nonce:ciphertext")).toThrow(
        "LocalEncryptionService not initialized"
      );
    });

    it("getSignalingSecretKey() throws when not initialized", () => {
      expect(() => service.getSignalingSecretKey()).toThrow(
        "LocalEncryptionService not initialized"
      );
    });

    it("getMasterKeyBytes() throws when not initialized", () => {
      expect(() => service.getMasterKeyBytes()).toThrow(
        "LocalEncryptionService not initialized"
      );
    });
  });

  // ── After guest initialization ────────────────────────────────────────────

  describe("after guest initialization (device-key path)", () => {
    let service: LocalEncryptionService;

    beforeEach(async () => {
      mockSecureConfigForGuestPath();
      // No password / userId → falls through to initDeviceKey
      service = new LocalEncryptionService({
        getPassword: () => null,
        userId: null,
      });
      await service.initialize();
    });

    it("encrypt() returns a versioned string starting with 'v1:'", () => {
      const result = service.encrypt("hello");

      expect(result).toMatch(/^v1:/);
    });

    it("encrypt/decrypt roundtrip returns original plaintext", () => {
      const plaintext = "secret message";

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("decrypt() returns unchanged string when content has no version prefix", () => {
      const legacy = "plain unencrypted string";

      const result = service.decrypt(legacy);

      expect(result).toBe(legacy);
    });

    it("decrypt() throws on malformed encrypted content (wrong parts count)", () => {
      const malformed = "v1:onlyonepart";

      expect(() => service.decrypt(malformed)).toThrow("Malformed encrypted content");
    });

    it("decrypt() throws when ciphertext cannot be decrypted (wrong key)", async () => {
      const encrypted = service.encrypt("hello");

      const otherService = new LocalEncryptionService();
      await otherService.setMasterKey(new Uint8Array(32).fill(99));

      expect(() => otherService.decrypt(encrypted)).toThrow(
        "Local decryption failed — possible data corruption"
      );
    });

    it("getSignalingSecretKey() returns a 32-byte Uint8Array after initialization", () => {
      const key = service.getSignalingSecretKey();

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it("getMasterKeyBytes() returns a non-empty Uint8Array after initialization", () => {
      const key = service.getMasterKeyBytes();

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBeGreaterThan(0);
    });

    it("setMasterKey() replaces the in-memory key and persists it", async () => {
      const newKey = new Uint8Array(32).fill(7);

      await service.setMasterKey(newKey);

      expect(service.getMasterKeyBytes()).toEqual(newKey);
      expect(SecureConfig.saveMasterKey).toHaveBeenCalled();
    });
  });

  // ── Cached key path ────────────────────────────────────────────────────────

  describe("cached key path (no-PIN fast path)", () => {
    it("loads keys from SecureStore cache without generating new keys", async () => {
      // Valid 32-byte base64 values
      const cachedMaster = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const cachedSignaling = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";

      (SecureConfig.getMasterKey as jest.Mock).mockResolvedValue(cachedMaster);
      (SecureConfig.getSignalingSecretKey as jest.Mock).mockResolvedValue(cachedSignaling);

      const ExpoCrypto = jest.requireMock("expo-crypto");
      ExpoCrypto.getRandomBytesAsync.mockClear();

      const service = new LocalEncryptionService({
        getPassword: () => "password",
        userId: "user-1",
      });
      await service.initialize();

      expect(ExpoCrypto.getRandomBytesAsync).not.toHaveBeenCalled();
      expect(service.getMasterKeyBytes()).toBeDefined();
    });
  });

  // ── No-PIN cached path ───────────────────────────────────────────────────────

  describe("no-PIN cached path", () => {
    it("uses the plaintext SecureStore cache and never hits the server", async () => {
      const cachedMaster = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const cachedSignaling = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
      (SecureConfig.getMasterKey as jest.Mock).mockResolvedValue(cachedMaster);
      (SecureConfig.getSignalingSecretKey as jest.Mock).mockResolvedValue(cachedSignaling);

      const service = new LocalEncryptionService({
        getPassword: () => "password",
        userId: "user-1",
      });
      await service.initialize();

      expect(service.getMasterKeyBytes()).toBeDefined();
      expect(service.getSignalingSecretKey().length).toBe(32);
    });
  });

  // ── Distinguishable key-load failures (issue #245) ──────────────────────────

  describe("key-load failure classification", () => {
    const validKeyB64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const apiClient = jest.requireMock("@/features/shared/core/api")
      .apiClient as { get: jest.Mock; post: jest.Mock };

    beforeEach(() => {
      jest.clearAllMocks();
      mockSecureConfigForGuestPath();
    });

    it("throws MASTER_KEY_UNAVAILABLE for an authenticated user when no password is in memory and no key is cached", async () => {
      // Arrange: post-failure retry — the password was consumed, cache is empty
      const service = new LocalEncryptionService({
        getPassword: () => null,
        userId: "user-1",
      });

      // Act / Assert
      await expect(service.initialize()).rejects.toMatchObject({
        code: "MASTER_KEY_UNAVAILABLE",
        detail: "cache-absent",
      });
    });

    it("never mints a random device key for an authenticated user", async () => {
      // Arrange
      const ExpoCrypto = jest.requireMock("expo-crypto");
      const service = new LocalEncryptionService({
        getPassword: () => null,
        userId: "user-1",
      });

      // Act
      await expect(service.initialize()).rejects.toBeInstanceOf(KeyInitError);

      // Assert: silently generating a fresh master key would orphan every
      // existing ciphertext, so it must not happen.
      expect(ExpoCrypto.getRandomBytesAsync).not.toHaveBeenCalled();
    });

    it("reports a partially written cache separately from an absent one", async () => {
      // Arrange: master key persisted but the signaling key write never landed
      (SecureConfig.getMasterKey as jest.Mock).mockResolvedValue(validKeyB64);
      (SecureConfig.getSignalingSecretKey as jest.Mock).mockResolvedValue(null);
      const service = new LocalEncryptionService({
        getPassword: () => null,
        userId: "user-1",
      });

      // Act / Assert
      await expect(service.initialize()).rejects.toMatchObject({
        code: "MASTER_KEY_UNAVAILABLE",
        detail: "cache-partial",
      });
    });

    it("throws SECURE_STORE_READ_FAILED when the cached bundle cannot be decoded", async () => {
      // Arrange
      (SecureConfig.getMasterKey as jest.Mock).mockResolvedValue("not-base64!!");
      (SecureConfig.getSignalingSecretKey as jest.Mock).mockResolvedValue(
        "also-not-base64!!"
      );
      const service = new LocalEncryptionService({
        getPassword: () => null,
        userId: "user-1",
      });

      // Act / Assert
      await expect(service.initialize()).rejects.toMatchObject({
        code: "SECURE_STORE_READ_FAILED",
      });
    });

    it("throws SECURE_STORE_READ_FAILED when SecureStore rejects a key read", async () => {
      // Arrange
      (SecureConfig.getMasterKey as jest.Mock).mockRejectedValue(
        new Error("secure store unavailable")
      );
      const service = new LocalEncryptionService({
        getPassword: () => null,
        userId: "user-1",
      });

      // Act / Assert
      await expect(service.initialize()).rejects.toMatchObject({
        code: "SECURE_STORE_READ_FAILED",
      });
    });

    it("throws MASTER_KEY_UNWRAP_FAILED when the server blob cannot be unwrapped", async () => {
      // Arrange: blob present but the KEK does not open it (wrong password)
      apiClient.get.mockResolvedValue({
        status: 200,
        data: { wrapped_blob: validKeyB64 },
      });
      const service = new LocalEncryptionService({
        getPassword: () => "wrong-password",
        userId: "user-1",
      });

      // Act / Assert
      await expect(service.initialize()).rejects.toMatchObject({
        code: "MASTER_KEY_UNWRAP_FAILED",
      });
    });

    it("throws KEY_SERVER_UNREACHABLE when the wrapped-key request fails with a non-404", async () => {
      // Arrange
      apiClient.get.mockRejectedValue({ response: { status: 503 } });
      const service = new LocalEncryptionService({
        getPassword: () => "password",
        userId: "user-1",
      });

      // Act / Assert
      await expect(service.initialize()).rejects.toMatchObject({
        code: "KEY_SERVER_UNREACHABLE",
      });
    });

    it("still generates a fresh bundle on 404 so first-time login works", async () => {
      // Arrange
      apiClient.get.mockRejectedValue({ response: { status: 404 } });
      apiClient.post.mockResolvedValue({ status: 200 });
      const service = new LocalEncryptionService({
        getPassword: () => "password",
        userId: "user-1",
      });

      // Act
      await service.initialize();

      // Assert
      expect(service.getMasterKeyBytes().length).toBe(32);
      expect(SecureConfig.saveMasterKey).toHaveBeenCalled();
    });

    it("still falls back to a device key for guests", async () => {
      // Arrange
      const service = new LocalEncryptionService({
        getPassword: () => null,
        userId: null,
      });

      // Act
      await service.initialize();

      // Assert
      expect(service.getMasterKeyBytes().length).toBe(32);
    });
  });
});
