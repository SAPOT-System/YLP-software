import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";

export interface WsEncryptionContext {
  mySecretKey: Uint8Array;
  getPeerPublicKey: (peerId: string) => Uint8Array | null;
  /**
   * Called by the WS adapter when a plaintext credential arrives in an encrypted
   * wire message, so the receiver can store the sender's key before decrypting.
   */
  storePeerKey?: (peerId: string, ecdhPublicKeyB64: string) => void;
}

export interface WsEncryptedPayload {
  nonce: string;
  box: string;
}

export function encryptSignalingPayload(
  inner: object,
  toPeerId: string,
  ctx: WsEncryptionContext
): WsEncryptedPayload | null {
  const theirKey = ctx.getPeerPublicKey(toPeerId);
  if (!theirKey) return null;
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const plaintext = new TextEncoder().encode(JSON.stringify(inner));
  const ciphertext = nacl.box(plaintext, nonce, theirKey, ctx.mySecretKey);
  return { nonce: encodeBase64(nonce), box: encodeBase64(ciphertext) };
}

export function decryptSignalingPayload(
  enc: WsEncryptedPayload,
  fromPeerId: string,
  ctx: WsEncryptionContext
): object | null {
  const theirKey = ctx.getPeerPublicKey(fromPeerId);
  if (!theirKey) return null;
  try {
    const nonce = decodeBase64(enc.nonce);
    const ciphertext = decodeBase64(enc.box);
    const plaintext = nacl.box.open(ciphertext, nonce, theirKey, ctx.mySecretKey);
    if (!plaintext) return null;
    return JSON.parse(new TextDecoder().decode(plaintext)) as object;
  } catch {
    return null;
  }
}
