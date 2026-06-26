import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import { deriveKey } from "./key-derivation";

export type RecoveryMethod = "password" | "phone" | "email" | "qa" | "token";

export interface WrappedBlob {
  method: RecoveryMethod;
  wrapped_blob: string;
  metadata?: string;
}

const ITERATIONS: Record<RecoveryMethod, number> = {
  password: 200_000,
  phone: 200_000,
  email: 100_000,
  qa: 300_000,
  token: 100_000,
};

// V2 payload layout: 1-byte version (0x02) | 32-byte masterKey | 32-byte signalingKey = 65 bytes
// V1 payload layout: 32-byte masterKey (legacy, no version byte)
const V2_VERSION = 0x02;
const V2_PAYLOAD_LENGTH = 65;
const KEY_LENGTH = 32;

export class KeyRecoveryService {
  async deriveWrappingKey(
    secret: string,
    salt: string,
    iterations: number
  ): Promise<Uint8Array> {
    return deriveKey(secret, salt, iterations);
  }

  wrapKey(masterKey: Uint8Array, wrappingKey: Uint8Array): string {
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const ct = nacl.secretbox(masterKey, nonce, wrappingKey);
    return encodeBase64(new Uint8Array([...nonce, ...ct]));
  }

  wrapKeyV2(masterKey: Uint8Array, signalingKey: Uint8Array, wrappingKey: Uint8Array): string {
    const payload = new Uint8Array(V2_PAYLOAD_LENGTH);
    payload[0] = V2_VERSION;
    payload.set(masterKey, 1);
    payload.set(signalingKey, 1 + KEY_LENGTH);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const ct = nacl.secretbox(payload, nonce, wrappingKey);
    return encodeBase64(new Uint8Array([...nonce, ...ct]));
  }

  unwrapKey(blob: string, wrappingKey: Uint8Array): Uint8Array | null {
    try {
      const raw = decodeBase64(blob);
      const nonce = raw.slice(0, nacl.secretbox.nonceLength);
      const ct = raw.slice(nacl.secretbox.nonceLength);
      return nacl.secretbox.open(ct, nonce, wrappingKey) ?? null;
    } catch {
      return null;
    }
  }

  unwrapKeyBundle(
    blob: string,
    wrappingKey: Uint8Array
  ): { masterKey: Uint8Array; signalingKey?: Uint8Array } | null {
    try {
      const raw = decodeBase64(blob);
      const nonce = raw.slice(0, nacl.secretbox.nonceLength);
      const ct = raw.slice(nacl.secretbox.nonceLength);
      const plaintext = nacl.secretbox.open(ct, nonce, wrappingKey);
      if (!plaintext) return null;
      if (plaintext.length === V2_PAYLOAD_LENGTH && plaintext[0] === V2_VERSION) {
        return {
          masterKey: plaintext.slice(1, 1 + KEY_LENGTH),
          signalingKey: plaintext.slice(1 + KEY_LENGTH, V2_PAYLOAD_LENGTH),
        };
      }
      if (plaintext.length === KEY_LENGTH) {
        // Legacy V1: raw master key only
        return { masterKey: new Uint8Array(plaintext) };
      }
      return null;
    } catch {
      return null;
    }
  }

  async wrapWithMethod(
    masterKey: Uint8Array,
    method: RecoveryMethod,
    secret: string,
    salt: string,
    metadata?: string,
    signalingKey?: Uint8Array
  ): Promise<WrappedBlob> {
    const wrappingKey = await this.deriveWrappingKey(
      secret,
      salt,
      ITERATIONS[method]
    );
    const wrapped_blob = signalingKey
      ? this.wrapKeyV2(masterKey, signalingKey, wrappingKey)
      : this.wrapKey(masterKey, wrappingKey);
    return { method, wrapped_blob, metadata };
  }

  static normalizeAnswer(answer: string): string {
    return answer.toLowerCase().trim();
  }

  static generateRecoveryToken(): { hex: string; bytes: Uint8Array } {
    const bytes = nacl.randomBytes(32);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return { hex, bytes };
  }
}
