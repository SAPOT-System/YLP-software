import nacl from "tweetnacl";
import * as Crypto from "expo-crypto";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import {
  getDeviceEncryptionKey,
  saveDeviceEncryptionKey,
} from "../stores/secure-config";

const VERSION_PREFIX = "v1:";

export class LocalEncryptionService {
  private key?: Uint8Array;

  async initialize(): Promise<void> {
    const stored = await getDeviceEncryptionKey();
    console.log("stored", stored);
    if (stored) {
      this.key = decodeBase64(stored);
    } else {
      console.log("newKey generating", nacl.secretbox.keyLength);
      const newKey = await Crypto.getRandomBytesAsync(nacl.secretbox.keyLength);
      console.log("newKey", newKey);
      await saveDeviceEncryptionKey(encodeBase64(newKey));
      this.key = newKey;
    }
  }

  encrypt(plaintext: string): string {
    if (!this.key) throw new Error("LocalEncryptionService not initialized");
    const nonce = Crypto.getRandomBytes(nacl.secretbox.nonceLength);
    // nacl.randomBytes(nacl.secretbox.nonceLength);
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
    if (!stored.startsWith(VERSION_PREFIX)) {
      return stored;
    }
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
}
