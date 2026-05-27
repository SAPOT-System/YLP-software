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

  async wrapWithMethod(
    masterKey: Uint8Array,
    method: RecoveryMethod,
    secret: string,
    salt: string,
    metadata?: string
  ): Promise<WrappedBlob> {
    const wrappingKey = await this.deriveWrappingKey(
      secret,
      salt,
      ITERATIONS[method]
    );
    const wrapped_blob = this.wrapKey(masterKey, wrappingKey);
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
