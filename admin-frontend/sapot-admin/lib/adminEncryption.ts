import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import { withBasePath } from "./basePath";

const STORAGE_KEY = "admin_ecdh_secret";
const ECDH_PREFIX = "ecdh:";

let mySecretKey: Uint8Array | null = null;
let myPublicKey: Uint8Array | null = null;

// peerId → nacl.box shared key (Uint8Array)
const sharedKeyCache = new Map<string, Uint8Array>();

function loadOrGenerateKeyPair(): { secretKey: Uint8Array; publicKey: Uint8Array } {
  const stored =
    typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

  if (stored) {
    const secretKey = decodeBase64(stored);
    const keyPair = nacl.box.keyPair.fromSecretKey(secretKey);
    return keyPair;
  }

  const keyPair = nacl.box.keyPair();
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, encodeBase64(keyPair.secretKey));
  }
  return keyPair;
}

/** Loads the keypair from localStorage without any network calls.
 *  Call this early (before sync) so decryption is available immediately. */
export function ensureAdminKeysLoaded(): void {
  if (mySecretKey && myPublicKey) return;
  const keyPair = loadOrGenerateKeyPair();
  mySecretKey = keyPair.secretKey;
  myPublicKey = keyPair.publicKey;
}

export async function initAdminKeyPair(token: string): Promise<void> {
  const keyPair = loadOrGenerateKeyPair();
  mySecretKey = keyPair.secretKey;
  myPublicKey = keyPair.publicKey;

  try {
    await fetch(withBasePath("/api/keys/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ecdh_public_key: encodeBase64(myPublicKey) }),
    });
  } catch {
    // Registration failure is non-fatal; key is still usable in memory
  }

  void token;
}

export async function fetchAndCachePeerKey(peerId: string): Promise<void> {
  if (sharedKeyCache.has(peerId) || !mySecretKey) return;

  try {
    const res = await fetch(`/api/keys/${peerId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ecdh_public_key) return;

    const peerPubKey = decodeBase64(data.ecdh_public_key);
    const sharedKey = nacl.box.before(peerPubKey, mySecretKey);
    sharedKeyCache.set(peerId, sharedKey);
  } catch {
    // Key unavailable — messages will fall back to plaintext
  }
}

export function encryptForPeer(peerId: string, plaintext: string): string {
  const sharedKey = sharedKeyCache.get(peerId);
  if (!sharedKey) return plaintext;

  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(new TextEncoder().encode(plaintext), nonce, sharedKey);
  return `${ECDH_PREFIX}${encodeBase64(nonce)}:${encodeBase64(ciphertext)}`;
}

export function decryptFromPeer(peerId: string, content: string): string {
  if (!content.startsWith(ECDH_PREFIX)) return content;

  const sharedKey = sharedKeyCache.get(peerId);
  if (!sharedKey) return content;

  try {
    const parts = content.slice(ECDH_PREFIX.length).split(":");
    if (parts.length !== 2) return content;
    const nonce = decodeBase64(parts[0]);
    const ct = decodeBase64(parts[1]);
    const plaintext = nacl.secretbox.open(ct, nonce, sharedKey);
    if (!plaintext) return content;
    return new TextDecoder().decode(plaintext);
  } catch {
    return content;
  }
}
