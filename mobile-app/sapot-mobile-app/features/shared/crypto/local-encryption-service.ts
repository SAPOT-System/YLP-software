import nacl from "tweetnacl";
import * as Crypto from "expo-crypto";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import {
  getMasterKey,
  saveMasterKey,
  getSignalingSecretKey,
  saveSignalingSecretKey,
} from "../core/stores/secure-config";
import { apiClient } from "@/features/shared/core/api";
import { KeyInitError } from "../core/errors/key-init-error";
import { appLog } from "../core/utils/logger";
import { deriveKey } from "./key-derivation";

const VERSION_PREFIX = "v1:";

interface KeyBundle {
  chat_master_key: string;
  signaling_secret_key: string;
}

interface LocalEncryptionCtx {
  getPassword: () => string | null;
  userId: string | null;
}

export class LocalEncryptionService {
  private key?: Uint8Array;
  private signalingKey?: Uint8Array;
  private ctx?: LocalEncryptionCtx;

  constructor(ctx?: LocalEncryptionCtx) {
    this.ctx = ctx;
  }

  async initialize(): Promise<void> {
    const password = this.ctx?.getPassword() ?? null;
    const userId = this.ctx?.userId ?? null;

    // Fast path: cached plain keys in SecureStore (OS keystore-protected).
    let cachedMaster: string | null | undefined;
    let cachedSignaling: string | null | undefined;
    try {
      cachedMaster = await getMasterKey();
      cachedSignaling = await getSignalingSecretKey();
    } catch (error) {
      throw new KeyInitError(
        "cached key bundle could not be read",
        "SECURE_STORE_READ_FAILED",
        { cause: error }
      );
    }

    if (cachedMaster && cachedSignaling) {
      try {
        this.key = decodeBase64(cachedMaster);
        this.signalingKey = decodeBase64(cachedSignaling);
      } catch (error) {
        throw new KeyInitError(
          "cached key bundle could not be decoded",
          "SECURE_STORE_READ_FAILED",
          { cause: error }
        );
      }
      return;
    }

    if (userId === null) {
      // Guest or unauthenticated — device-only key
      await this.initDeviceKey();
      return;
    }

    if (password !== null) {
      await this.initFromServer(password, userId);
      return;
    }

    // Authenticated, but the cache is unusable and the password is no longer in
    // memory. Falling through to a device-only key here would silently mint a
    // fresh master key and orphan every existing ciphertext, so fail with a
    // reason the caller can surface instead.
    const detail = cachedMaster || cachedSignaling ? "cache-partial" : "cache-absent";
    appLog.error("enc › master key unavailable", { detail });
    throw new KeyInitError(
      "no cached key bundle and no password available to unwrap one",
      "MASTER_KEY_UNAVAILABLE",
      { detail }
    );
  }

  private async initFromServer(password: string, userId: string): Promise<void> {
    const kek = await deriveKey(password, userId, 200_000);
    let blobExists = false;

    try {
      const res = await apiClient.get<{ wrapped_blob: string }>(
        "/users/wrapped-key"
      );

      if (res.status === 200) {
        blobExists = true;
        const bundle = this.unwrapBundle(res.data.wrapped_blob, kek);

        if (bundle) {
          this.applyBundle(bundle);
          await this.cacheKeys(bundle);
          return;
        }
        // Decryption failed - wrong password or password changed without re-wrapping
        throw new KeyInitError(
          "wrapped key blob could not be unwrapped",
          "MASTER_KEY_UNWRAP_FAILED"
        );
      }
    } catch (err: unknown) {
      if (err instanceof KeyInitError) throw err;

      const is404 =
        err !== null &&
        typeof err === "object" &&
        "response" in err &&
        (err as { response?: { status?: number } }).response?.status === 404;

      if (!is404) {
        // Network error or other API failure - do not generate fresh bundle
        throw new KeyInitError(
          "wrapped key could not be fetched",
          "KEY_SERVER_UNREACHABLE",
          { cause: err }
        );
      }
    }

    // No existing blob found (404) - only then generate a fresh bundle
    if (!blobExists) {
      const bundle = this.generateBundle();
      this.applyBundle(bundle);
      await this.uploadBundle(bundle, kek);
      await this.cacheKeys(bundle);
    }
  }

  private async initDeviceKey(): Promise<void> {
    const newKey = await Crypto.getRandomBytesAsync(nacl.secretbox.keyLength);
    this.key = newKey;
    // Signaling key is not used in guest/device-only mode
    this.signalingKey = nacl.randomBytes(32);
  }

  private generateBundle(): KeyBundle {
    return {
      chat_master_key: encodeBase64(nacl.randomBytes(32)),
      signaling_secret_key: encodeBase64(nacl.randomBytes(32)),
    };
  }

  private applyBundle(bundle: KeyBundle): void {
    this.key = decodeBase64(bundle.chat_master_key);
    this.signalingKey = decodeBase64(bundle.signaling_secret_key);
  }

  private unwrapBundle(blob: string, kek: Uint8Array): KeyBundle | null {
    try {
      const raw = decodeBase64(blob);
      const nonce = raw.slice(0, nacl.secretbox.nonceLength);
      const ct = raw.slice(nacl.secretbox.nonceLength);
      const plaintext = nacl.secretbox.open(ct, nonce, kek);
      if (!plaintext) return null;
      return JSON.parse(new TextDecoder().decode(plaintext)) as KeyBundle;
    } catch {
      return null;
    }
  }

  private async uploadBundle(
    bundle: KeyBundle,
    kek: Uint8Array
  ): Promise<void> {
    const plaintext = new TextEncoder().encode(JSON.stringify(bundle));
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const ct = nacl.secretbox(plaintext, nonce, kek);
    const blob = encodeBase64(new Uint8Array([...nonce, ...ct]));
    try {
      await apiClient.post("/users/wrapped-key", { wrapped_blob: blob });
    } catch (error) {
      appLog.warn("enc › upload wrapped key failed — will retry next login", { error });
    }
  }

  private async cacheKeys(bundle: KeyBundle): Promise<void> {
    await saveMasterKey(bundle.chat_master_key);
    await saveSignalingSecretKey(bundle.signaling_secret_key);
  }

  // ── Public key accessors ──────────────────────────────────────────────────

  encrypt(plaintext: string): string {
    if (!this.key) throw new Error("LocalEncryptionService not initialized");
    const nonce = Crypto.getRandomBytes(nacl.secretbox.nonceLength);
    const ciphertext = nacl.secretbox(
      new TextEncoder().encode(plaintext),
      nonce,
      this.key
    );
    return `${VERSION_PREFIX}${encodeBase64(nonce)}:${encodeBase64(
      ciphertext
    )}`;
  }

  decrypt(stored: string): string {
    if (!stored.startsWith(VERSION_PREFIX)) return stored;
    if (!this.key) throw new Error("LocalEncryptionService not initialized");
    const parts = stored.slice(VERSION_PREFIX.length).split(":");
    if (parts.length !== 2) throw new Error("Malformed encrypted content");
    const nonce = decodeBase64(parts[0]);
    const ciphertext = decodeBase64(parts[1]);
    const plaintext = nacl.secretbox.open(ciphertext, nonce, this.key);
    if (!plaintext)
      throw new Error("Local decryption failed — possible data corruption");
    return new TextDecoder().decode(plaintext);
  }

  getSignalingSecretKey(): Uint8Array {
    if (!this.signalingKey)
      throw new Error("LocalEncryptionService not initialized");
    return this.signalingKey;
  }

  getMasterKeyBytes(): Uint8Array {
    if (!this.key) throw new Error("LocalEncryptionService not initialized");
    return this.key;
  }

  async setMasterKey(key: Uint8Array): Promise<void> {
    this.key = key;
    await saveMasterKey(encodeBase64(key));
  }

  async updateMasterKeyPassword(newPassword: string): Promise<void> {
    const userId = this.ctx?.userId;
    if (!userId) throw new Error("updateMasterKeyPassword requires a userId");
    if (!this.key || !this.signalingKey) {
      throw new Error("Master key not initialized in memory");
    }
    const bundle: KeyBundle = {
      chat_master_key: encodeBase64(this.key),
      signaling_secret_key: encodeBase64(this.signalingKey),
    };
    const newKek = await deriveKey(newPassword, userId, 200_000);
    await this.uploadBundle(bundle, newKek);
    await this.cacheKeys(bundle);
  }
}
