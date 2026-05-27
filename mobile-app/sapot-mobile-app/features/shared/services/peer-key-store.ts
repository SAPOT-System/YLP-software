import * as SecureStore from "expo-secure-store";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import { appLog } from "../utils/logger";

export type ContactKeyUploader = (
  peerId: string,
  publicKey: Uint8Array
) => Promise<void>;

export class PeerKeyStore {
  private store = new Map<string, Uint8Array>();
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
      appLog.warn("peer-key-store › public key changed for known peer", { peerId });
    }
    this.store.set(peerId, publicKey);
    void SecureStore.setItemAsync("peer_ecdh_pub_" + peerId, encodeBase64(publicKey));
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

  async load(peerId: string): Promise<Uint8Array | null> {
    const stored = await SecureStore.getItemAsync("peer_ecdh_pub_" + peerId);
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
    this.store.set(peerId, publicKey);
    await SecureStore.setItemAsync("peer_ecdh_pub_" + peerId, encodeBase64(publicKey));
    this.keySetListeners.forEach((l) => l(peerId));
  }

  delete(peerId: string): void {
    this.store.delete(peerId);
    void SecureStore.deleteItemAsync("peer_ecdh_pub_" + peerId);
  }

  clear(): void {
    this.store.clear();
  }
}

function keysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return a.every((byte, i) => byte === b[i]);
}
