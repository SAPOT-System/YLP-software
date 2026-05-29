import * as SecureStore from "expo-secure-store";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import { appLog } from "../utils/logger";

export type ContactKeyUploader = (
  peerId: string,
  publicKey: Uint8Array
) => Promise<void>;

const PUB_PREFIX = "peer_ecdh_pub_";
const HIST_PREFIX = "peer_ecdh_hist_";
const MAX_PEER_KEY_HISTORY = 5;

export class PeerKeyStore {
  private store = new Map<string, Uint8Array>();
  /** Previously-seen public keys per peer (newest first), excluding the current
   *  one in `store`. Retained so conversation keys derived from an older peer key
   *  can still decrypt messages stored before the peer rotated its key. */
  private history = new Map<string, Uint8Array[]>();
  private keySetListeners: Array<(peerId: string) => void> = [];
  /** Optional hook: called after every set() to back up the key server-side. */
  private contactKeyUploader?: ContactKeyUploader;

  setContactKeyUploader(uploader: ContactKeyUploader): void {
    this.contactKeyUploader = uploader;
  }

  /**
   * Register a callback that fires whenever a peer's public key is stored or
   * updated. Used by ChatService to re-derive conversation keys after a TCP
   * handshake delivers a guest peer's appPub without a server round-trip.
   */
  onKeySet(listener: (peerId: string) => void): () => void {
    this.keySetListeners.push(listener);
    return () => {
      this.keySetListeners = this.keySetListeners.filter((l) => l !== listener);
    };
  }

  set(peerId: string, publicKey: Uint8Array): void {
    const existing = this.store.get(peerId);
    if (existing && !keysEqual(existing, publicKey)) {
      // TOFU: key changed for a known peer — could be a reinstall or a MITM attempt.
      // Retain the previous key so conversation keys derived from it can still
      // decrypt messages stored before the rotation (otherwise the history would
      // render as un-decryptable blanks).
      appLog.warn("peer-key-store › public key changed for known peer; retaining previous key", { peerId });
      this.pushHistory(peerId, existing);
      void this.persistHistory(peerId);
    }
    this.store.set(peerId, publicKey);
    void SecureStore.setItemAsync(PUB_PREFIX + peerId, encodeBase64(publicKey));
    this.keySetListeners.forEach((l) => l(peerId));
    if (this.contactKeyUploader) {
      void this.contactKeyUploader(peerId, publicKey).catch((err) =>
        appLog.warn("peer-key-store › contact key upload failed", { peerId, err })
      );
    }
  }

  get(peerId: string): Uint8Array | null {
    return this.store.get(peerId) ?? null;
  }

  /** Returns previously-seen keys for a peer (newest first), excluding the
   *  current key. Used to derive fallback conversation keys for decryption. */
  getHistory(peerId: string): Uint8Array[] {
    return this.history.get(peerId) ?? [];
  }

  private pushHistory(peerId: string, key: Uint8Array): void {
    const h = this.history.get(peerId) ?? [];
    if (h.some((k) => keysEqual(k, key))) return;
    h.unshift(key);
    if (h.length > MAX_PEER_KEY_HISTORY) h.length = MAX_PEER_KEY_HISTORY;
    this.history.set(peerId, h);
  }

  private async persistHistory(peerId: string): Promise<void> {
    const h = this.history.get(peerId) ?? [];
    try {
      await SecureStore.setItemAsync(
        HIST_PREFIX + peerId,
        JSON.stringify(h.map((k) => encodeBase64(k)))
      );
    } catch (err) {
      appLog.warn("peer-key-store › history persist failed", { peerId, err });
    }
  }

  private async loadHistory(peerId: string): Promise<void> {
    const raw = await SecureStore.getItemAsync(HIST_PREFIX + peerId);
    if (!raw) return;
    try {
      const arr = (JSON.parse(raw) as string[]).map((b) => decodeBase64(b));
      this.history.set(peerId, arr);
    } catch {
      // Corrupt history entry — ignore; current key still works for new messages.
    }
  }

  async load(peerId: string): Promise<Uint8Array | null> {
    await this.loadHistory(peerId);
    const stored = await SecureStore.getItemAsync(PUB_PREFIX + peerId);
    if (!stored) return null;
    const key = decodeBase64(stored);
    this.store.set(peerId, key);
    return key;
  }

  async loadAll(peerIds: string[]): Promise<void> {
    await Promise.allSettled(peerIds.map(id => this.load(id)));
  }

  /**
   * Restores a key from a server-side backup without triggering the
   * contactKeyUploader (prevents an upload loop on login).
   * Also writes to SecureStore so subsequent loads work offline.
   */
  async restore(peerId: string, publicKey: Uint8Array): Promise<void> {
    const existing = this.store.get(peerId);
    if (existing && !keysEqual(existing, publicKey)) {
      this.pushHistory(peerId, existing);
      void this.persistHistory(peerId);
    }
    this.store.set(peerId, publicKey);
    await SecureStore.setItemAsync(PUB_PREFIX + peerId, encodeBase64(publicKey));
    this.keySetListeners.forEach((l) => l(peerId));
  }

  delete(peerId: string): void {
    this.store.delete(peerId);
    this.history.delete(peerId);
    void SecureStore.deleteItemAsync(PUB_PREFIX + peerId);
    void SecureStore.deleteItemAsync(HIST_PREFIX + peerId);
  }

  clear(): void {
    this.store.clear();
    this.history.clear();
  }
}

function keysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return a.every((byte, i) => byte === b[i]);
}
