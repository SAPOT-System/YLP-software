import * as ExpoSecureStore from "expo-secure-store";
import { LocalEncryptionService } from "../local-encryption-service";

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

jest.mock("../../stores/secure-config", () => ({
  getMasterKey: jest.fn(),
  saveMasterKey: jest.fn().mockResolvedValue(undefined),
  getSignalingSecretKey: jest.fn(),
  saveSignalingSecretKey: jest.fn().mockResolvedValue(undefined),
  getPinEnabled: jest.fn().mockResolvedValue(false),
  savePinEnabled: jest.fn().mockResolvedValue(undefined),
  getPinWrappedBundle: jest.fn().mockResolvedValue(undefined),
  savePinWrappedBundle: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../key-derivation", () => ({
  deriveKey: jest.fn().mockResolvedValue(new Uint8Array(32).fill(1)),
}));

// Stub the barrel import to avoid the api/client → @/config/runtime chain.
jest.mock("@/features/shared", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

import * as SecureConfig from "../../stores/secure-config";

function mockSecureConfigForGuestPath() {
  (SecureConfig.getPinEnabled as jest.Mock).mockResolvedValue(false);
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
        getPIN: () => null,
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

      (SecureConfig.getPinEnabled as jest.Mock).mockResolvedValue(false);
      (SecureConfig.getMasterKey as jest.Mock).mockResolvedValue(cachedMaster);
      (SecureConfig.getSignalingSecretKey as jest.Mock).mockResolvedValue(cachedSignaling);

      const ExpoCrypto = jest.requireMock("expo-crypto");
      ExpoCrypto.getRandomBytesAsync.mockClear();

      const service = new LocalEncryptionService({
        getPassword: () => "password",
        getPIN: () => null,
        userId: "user-1",
      });
      await service.initialize();

      expect(ExpoCrypto.getRandomBytesAsync).not.toHaveBeenCalled();
      expect(service.getMasterKeyBytes()).toBeDefined();
    });
  });

  // ── PIN management ─────────────────────────────────────────────────────────

  describe("PIN management", () => {
    let service: LocalEncryptionService;

    beforeEach(async () => {
      mockSecureConfigForGuestPath();
      service = new LocalEncryptionService({
        getPassword: () => null,
        getPIN: () => null,
        userId: "user-123",
      });
      await service.initialize();
      jest.clearAllMocks();
      (SecureConfig.savePinEnabled as jest.Mock).mockResolvedValue(undefined);
      (SecureConfig.savePinWrappedBundle as jest.Mock).mockResolvedValue(undefined);
      (SecureConfig.getPinWrappedBundle as jest.Mock).mockResolvedValue(undefined);
    });

    it("isPINEnabled() returns current value from SecureStore", async () => {
      (SecureConfig.getPinEnabled as jest.Mock).mockResolvedValue(false);

      const result = await service.isPINEnabled();

      expect(result).toBe(false);
    });

    it("setupPIN() saves PIN-wrapped bundle and enables PIN flag", async () => {
      await service.setupPIN("password", "1234");

      expect(SecureConfig.savePinWrappedBundle).toHaveBeenCalledWith(expect.any(String));
      expect(SecureConfig.savePinEnabled).toHaveBeenCalledWith(true);
      expect(ExpoSecureStore.deleteItemAsync).toHaveBeenCalledWith("masterKey");
      expect(ExpoSecureStore.deleteItemAsync).toHaveBeenCalledWith("signalingSecretKey");
    });

    it("setupPIN() throws when no userId is in context", async () => {
      const serviceNoUser = new LocalEncryptionService({
        getPassword: () => null,
        getPIN: () => null,
        userId: null,
      });
      await serviceNoUser.initialize();

      await expect(serviceNoUser.setupPIN("pwd", "1234")).rejects.toThrow(
        "setupPIN requires an authenticated user"
      );
    });

    it("removePIN() returns true and disables PIN when no local blob exists", async () => {
      (SecureConfig.getPinWrappedBundle as jest.Mock).mockResolvedValue(undefined);

      const result = await service.removePIN("password", "1234");

      expect(result).toBe(true);
      expect(SecureConfig.savePinEnabled).toHaveBeenCalledWith(false);
    });

    it("changePIN() saves new PIN-wrapped bundle when no previous blob to verify", async () => {
      (SecureConfig.getPinWrappedBundle as jest.Mock).mockResolvedValue(undefined);

      const result = await service.changePIN("password", "0000", "5678");

      expect(result).toBe(true);
      expect(SecureConfig.savePinWrappedBundle).toHaveBeenCalled();
    });
  });
});
