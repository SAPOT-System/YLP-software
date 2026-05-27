import nacl from "tweetnacl";
import * as Crypto from "expo-crypto";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import {
  getMasterKey,
  saveMasterKey,
  getSignalingSecretKey,
  saveSignalingSecretKey,
  getPinEnabled,
  savePinEnabled,
  getPinWrappedBundle,
  savePinWrappedBundle,
} from "../stores/secure-config";
import { deleteItemAsync } from "expo-secure-store";
import { apiClient } from "@/features/shared";
import { deriveKey } from "./key-derivation";

const VERSION_PREFIX = "v1:";

interface KeyBundle {
  chat_master_key: string;
  signaling_secret_key: string;
}

interface LocalEncryptionCtx {
  getPassword: () => string | null;
  getPIN: () => string | null;
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
    const pinEnabled = await getPinEnabled();

    if (pinEnabled) {
      const localBlob = await getPinWrappedBundle();
      const pin = this.ctx?.getPIN() ?? null;

      if (localBlob && pin !== null && pin !== "") {
        const unlocked = await this.unlockFromPinBlob(localBlob, pin);
        if (unlocked) return;
      }
      // PIN enabled but no local blob or no PIN provided yet — fall through to
      // server fetch path (first login after enabling PIN, or re-login).
    }

    const password = this.ctx?.getPassword() ?? null;
    const userId = this.ctx?.userId ?? null;
    const pin = this.ctx?.getPIN() ?? "";

    // No-PIN fast path: try cached plain keys in SecureStore
    if (!pinEnabled) {
      const cachedMaster = await getMasterKey();
      const cachedSignaling = await getSignalingSecretKey();
      if (cachedMaster && cachedSignaling) {
        this.key = decodeBase64(cachedMaster);
        this.signalingKey = decodeBase64(cachedSignaling);
        return;
      }
    }

    if (password === null || userId === null) {
      // Guest or unauthenticated — device-only key
      await this.initDeviceKey();
      return;
    }

    await this.initFromServer(password, pin, userId, pinEnabled);
  }

  private async initFromServer(
    password: string,
    pin: string,
    userId: string,
    pinEnabled: boolean
  ): Promise<void> {
    const kek = await deriveKey(password + pin, userId, 200_000);

    try {
      const res = await apiClient.get<{ wrapped_blob: string }>(
        "/users/wrapped-key"
      );

      if (res.status === 200) {
        const bundle = this.unwrapBundle(res.data.wrapped_blob, kek);
        if (bundle) {
          this.applyBundle(bundle);
          await this.cacheKeys(pinEnabled, bundle, pin, userId);
          return;
        }
        // Wrong password/PIN — fall through to generate new
      }
    } catch (err: unknown) {
      const is404 =
        err !== null &&
        typeof err === "object" &&
        "response" in err &&
        (err as { response?: { status?: number } }).response?.status === 404;

      if (!is404) {
        // Network or unexpected error — fall through to generate new
      }
    }

    // No existing blob or decryption failed — generate fresh bundle
    const bundle = this.generateBundle();
    this.applyBundle(bundle);
    await this.uploadBundle(bundle, kek);
    await this.cacheKeys(pinEnabled, bundle, pin, userId);
  }

  private async initDeviceKey(): Promise<void> {
    const newKey = await Crypto.getRandomBytesAsync(nacl.secretbox.keyLength);
    this.key = newKey;
    // Signaling key is not used in guest/device-only mode
    this.signalingKey = nacl.randomBytes(32);
  }

  private async unlockFromPinBlob(blob: string, pin: string): Promise<boolean> {
    const userId = this.ctx?.userId ?? null;
    if (!userId) return false;
    try {
      const pinKek = await deriveKey(pin, userId, 100_000);
      const raw = decodeBase64(blob);
      const nonce = raw.slice(0, nacl.secretbox.nonceLength);
      const ct = raw.slice(nacl.secretbox.nonceLength);
      const plaintext = nacl.secretbox.open(ct, nonce, pinKek);
      if (!plaintext) return false;
      const bundle = JSON.parse(
        new TextDecoder().decode(plaintext)
      ) as KeyBundle;
      this.applyBundle(bundle);
      return true;
    } catch {
      return false;
    }
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
    } catch {
      // Network failure — keys still usable in memory, will retry next login
    }
  }

  private async cacheKeys(
    pinEnabled: boolean,
    bundle: KeyBundle,
    pin: string,
    userId: string
  ): Promise<void> {
    if (pinEnabled && pin) {
      await this.saveLocalPinCache(bundle, pin, userId);
    } else {
      await saveMasterKey(bundle.chat_master_key);
      await saveSignalingSecretKey(bundle.signaling_secret_key);
    }
  }

  private async saveLocalPinCache(
    bundle: KeyBundle,
    pin: string,
    userId: string
  ): Promise<void> {
    const pinKek = await deriveKey(pin, userId, 100_000);
    const plaintext = new TextEncoder().encode(JSON.stringify(bundle));
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const ct = nacl.secretbox(plaintext, nonce, pinKek);
    await savePinWrappedBundle(encodeBase64(new Uint8Array([...nonce, ...ct])));
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

  // ── PIN management ────────────────────────────────────────────────────────

  async isPINEnabled(): Promise<boolean> {
    return getPinEnabled();
  }

  async setupPIN(password: string, newPin: string): Promise<void> {
    const userId = this.ctx?.userId;
    if (!userId) throw new Error("setupPIN requires an authenticated user");
    const bundle: KeyBundle = {
      chat_master_key: encodeBase64(this.key!),
      signaling_secret_key: encodeBase64(this.signalingKey!),
    };
    const newKek = await deriveKey(password + newPin, userId, 200_000);
    await this.uploadBundle(bundle, newKek);
    await this.saveLocalPinCache(bundle, newPin, userId);
    await savePinEnabled(true);
    await deleteItemAsync("masterKey");
    await deleteItemAsync("signalingSecretKey");
  }

  async removePIN(password: string, currentPin: string): Promise<boolean> {
    const userId = this.ctx?.userId;
    if (!userId) return false;
    const localBlob = await getPinWrappedBundle();
    if (localBlob) {
      const ok = await this.unlockFromPinBlob(localBlob, currentPin);
      if (!ok) return false;
    }
    const bundle: KeyBundle = {
      chat_master_key: encodeBase64(this.key!),
      signaling_secret_key: encodeBase64(this.signalingKey!),
    };
    const noPin = await deriveKey(password, userId, 200_000);
    await this.uploadBundle(bundle, noPin);
    await saveMasterKey(bundle.chat_master_key);
    await saveSignalingSecretKey(bundle.signaling_secret_key);
    await deleteItemAsync("pinWrappedBundle");
    await savePinEnabled(false);
    return true;
  }

  async changePIN(
    password: string,
    oldPin: string,
    newPin: string
  ): Promise<boolean> {
    const userId = this.ctx?.userId;
    if (!userId) return false;
    const localBlob = await getPinWrappedBundle();
    if (localBlob) {
      const ok = await this.unlockFromPinBlob(localBlob, oldPin);
      if (!ok) return false;
    }
    const bundle: KeyBundle = {
      chat_master_key: encodeBase64(this.key!),
      signaling_secret_key: encodeBase64(this.signalingKey!),
    };
    const newKek = await deriveKey(password + newPin, userId, 200_000);
    await this.uploadBundle(bundle, newKek);
    await this.saveLocalPinCache(bundle, newPin, userId);
    return true;
  }
}
