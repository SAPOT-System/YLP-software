import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import { Message } from "../types";

export interface EncryptedEnvelope {
  type: "encrypted";
  nonce: string;
  box: string;
}

export interface HandshakeInit {
  type: "handshake-init";
  pub: string;
}

export interface HandshakeAck {
  type: "handshake-ack";
  pub: string;
}

export type TcpFrame = EncryptedEnvelope | HandshakeInit | HandshakeAck;

export function generateKeyPair(): nacl.BoxKeyPair {
  return nacl.box.keyPair();
}

export function computeSharedKey(
  mySecretKey: Uint8Array,
  theirPublicKey: Uint8Array
): Uint8Array {
  return nacl.box.before(theirPublicKey, mySecretKey);
}

export function encryptMessage(
  sharedKey: Uint8Array,
  message: Message
): EncryptedEnvelope {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const plaintext = new TextEncoder().encode(JSON.stringify(message));
  const ciphertext = nacl.secretbox(plaintext, nonce, sharedKey);
  return {
    type: "encrypted",
    nonce: encodeBase64(nonce),
    box: encodeBase64(ciphertext),
  };
}

export function decryptMessage(
  sharedKey: Uint8Array,
  envelope: EncryptedEnvelope
): Message {
  const nonce = decodeBase64(envelope.nonce);
  const ciphertext = decodeBase64(envelope.box);
  const plaintext = nacl.secretbox.open(ciphertext, nonce, sharedKey);
  if (!plaintext) {
    throw new Error("TCP decryption failed — message authentication failed");
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as Message;
}

export function buildHandshakeInit(publicKey: Uint8Array): HandshakeInit {
  return { type: "handshake-init", pub: encodeBase64(publicKey) };
}

export function buildHandshakeAck(publicKey: Uint8Array): HandshakeAck {
  return { type: "handshake-ack", pub: encodeBase64(publicKey) };
}

export function parsePublicKey(b64: string): Uint8Array {
  return decodeBase64(b64);
}
