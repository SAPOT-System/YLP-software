import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import * as SecureStore from "expo-secure-store";
import { appLog } from "../core/utils/logger";
import { apiClient } from "../core/api/client";

export interface SignedCredential {
  peerId: string;
  ecdhPublicKey: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
}

export interface SignedCredentialPayload {
  peer_id: string;
  ecdh_public_key: string;
  issued_at: string;
  expires_at: string;
  signature: string;
}

export class PeerKeyService {
  private secretKey?: Uint8Array;
  private publicKey?: Uint8Array;
  private credential?: SignedCredential;
  private serverVerifyKey?: Uint8Array;

  /**
   * Generates (or loads from SecureStore) a stable Curve25519 keypair for a
   * guest user. No server registration — the public key is exchanged directly
   * via the TCP handshake. After this call, `getMySecretKey()` and
   * `getMyPublicKey()` are available so `ChatService` can derive conversation keys.
   *
   * **Recovery note:** The secret key is persisted in SecureStore under
   * `"guest_ecdh_secret_key"`. It survives app restarts and (on most platforms)
   * OS-level backups. However, a clean reinstall regenerates a fresh keypair,
   * which invalidates all previously derived conversation keys — messages stored
   * from a prior install become unreadable. This is an accepted limitation for
   * guest (unauthenticated) users who have no server-backed recovery path.
   */
  async initGuestKey(): Promise<void> {
    const GUEST_KEY = "guest_ecdh_secret_key";
    try {
      const stored = await SecureStore.getItemAsync(GUEST_KEY);
      if (stored) {
        const secretKey = decodeBase64(stored);
        const keyPair = nacl.box.keyPair.fromSecretKey(secretKey);
        this.secretKey = keyPair.secretKey;
        this.publicKey = keyPair.publicKey;
        appLog.info("peer-key-service › guest key loaded from store");
      } else {
        const keyPair = nacl.box.keyPair();
        this.secretKey = keyPair.secretKey;
        this.publicKey = keyPair.publicKey;
        await SecureStore.setItemAsync(GUEST_KEY, encodeBase64(keyPair.secretKey));
        appLog.info("peer-key-service › guest key generated");
      }
    } catch (error) {
      appLog.warn("peer-key-service › guest key init failed", { error });
    }
  }

  async initFromSecretKey(
    secretKey: Uint8Array,
    apiBaseUrl: string,
    accessToken: string,
    peerId: string
  ): Promise<void> {
    const keyPair = nacl.box.keyPair.fromSecretKey(secretKey);
    this.secretKey = keyPair.secretKey;
    this.publicKey = keyPair.publicKey;

    await this.registerKey(apiBaseUrl, accessToken);

    void peerId;
  }

  private async registerKey(
    apiBaseUrl: string,
    accessToken: string
  ): Promise<void> {
    if (!this.publicKey) return;
    try {
      const res = await fetch(`${apiBaseUrl}/keys/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ ecdh_public_key: encodeBase64(this.publicKey) }),
      });

      if (res.ok) {
        const cred = await res.json();
        this.credential = {
          peerId: cred.peer_id,
          ecdhPublicKey: cred.ecdh_public_key,
          issuedAt: cred.issued_at,
          expiresAt: cred.expires_at,
          signature: cred.signature,
        };
        appLog.info("peer-key-service › registered with server");
      } else {
        appLog.warn("peer-key-service › registration failed", {
          status: res.status,
        });
      }
    } catch (error) {
      appLog.warn("peer-key-service › registration error", { error });
    }
  }

  async fetchPeerPublicKey(peerId: string): Promise<Uint8Array | null> {
    try {
      const res = await apiClient.get<SignedCredentialPayload>(`/keys/${peerId}`);
      if (res.status === 200) {
        const cred = res.data;
        const credTrans: SignedCredential = {peerId: cred.peer_id, ecdhPublicKey: cred.ecdh_public_key, issuedAt: cred.issued_at, expiresAt: cred.expires_at, signature: cred.signature};

        if (this.verifyPeerCredential(credTrans)) {
          return decodeBase64(credTrans.ecdhPublicKey);
        } else {
          appLog.warn(
            "peer-key-service › fetched credential failed verification",
            { peerId }
          );
        }
      }
    } catch (error) {
      appLog.warn("peer-key-service › fetch peer key failed", {
        peerId,
        error,
      });
    }
    return null;
  }

  async fetchPeerType(peerId: string): Promise<boolean | null> {
    try {
      const res = await apiClient.get<{ is_guest: boolean }>(`/keys/${peerId}/type`);
      return res.data.is_guest;
    } catch {
      return null; // server unreachable — caller falls back to handshake result
    }
  }

  isCredentialExpiringSoon(thresholdMs = 60_000): boolean {
    if (!this.credential) return true;
    return (
      new Date(this.credential.expiresAt).getTime() < Date.now() + thresholdMs
    );
  }

  async refreshCredential(
    apiBaseUrl: string,
    accessToken: string
  ): Promise<void> {
    await this.registerKey(apiBaseUrl, accessToken);
  }

  setServerVerifyKey(key: Uint8Array): void {
    this.serverVerifyKey = key;
  }

  /**
   * Loads the server's Ed25519 verify key using a cached-then-live strategy:
   * 1. Load from SecureStore immediately (works offline for returning users).
   * 2. Attempt a live fetch from GET /keys/server-public-key (no auth required)
   *    to refresh the cache.
   * Call this for both guest and authenticated users so peer credential
   * verification works in both directions.
   */
  async loadServerVerifyKey(): Promise<void> {
    const CACHE_KEY = "server_ed25519_pub";
    try {
      const cached = await SecureStore.getItemAsync(CACHE_KEY);
      if (cached) {
        this.serverVerifyKey = decodeBase64(cached);
      }
    } catch (error) {
      appLog.debug("peer-key-service › SecureStore unavailable for server key cache", { error });
    }
    try {
      const res = await apiClient.get<{ ed25519PublicKey: string }>("/keys/server-public-key");
      const freshKey = res.data.ed25519PublicKey;
      this.serverVerifyKey = decodeBase64(freshKey);
      await SecureStore.setItemAsync(CACHE_KEY, freshKey);
    } catch (error) {
      appLog.warn("peer-key-service › server verify key fetch failed", { error });
    }
  }

  verifyPeerCredential(cred: SignedCredential): boolean {
    // 1. Expiry check
    if (new Date(cred.expiresAt).getTime() <= Date.now()) return false;

    // 2. Signature verification (if server key is available)
    if (this.serverVerifyKey) {
      try {
        // Must match the server's signing format: "{peerId}:{ecdhPublicKey}:{issuedAt}:{expiresAt}"
        const payload = `${cred.peerId}:${cred.ecdhPublicKey}:${cred.issuedAt}:${cred.expiresAt}`;
        const messageBytes = new TextEncoder().encode(payload);
        const sigBytes = decodeBase64(cred.signature);
        const valid = nacl.sign.detached.verify(
          messageBytes,
          sigBytes,
          this.serverVerifyKey
        );
        if (!valid) {
          appLog.warn(
            "peer-key-service › Ed25519 signature verification failed",
            { peerId: cred.peerId }
          );
          return false;
        }
      } catch (e) {
        appLog.warn("peer-key-service › Ed25519 verification error", {
          error: e,
        });
        return false;
      }
    } else {
      appLog.warn(
        "peer-key-service › Ed25519 verify skipped: server key not configured"
      );
    }

    return true;
  }

  /**
   * Encrypts a peer's ECDH public key with the auth user's master key and
   * uploads it to `POST /keys/contacts/{peerId}`. Called whenever the TCP
   * handshake delivers a new peer appPub (guest peers are not server-registered
   * and cannot be retrieved via `/keys/{peerId}`). This ensures the auth user
   * can decrypt past conversations on a new device or after re-login.
   *
   * The payload is a nacl.secretbox-encrypted blob — only the auth user can
   * decrypt it; the server never sees the plaintext public key.
   */
  async uploadContactKey(
    peerId: string,
    peerPublicKey: Uint8Array,
    masterKey: Uint8Array,
    accessToken: string,
    apiBaseUrl: string
  ): Promise<void> {
    try {
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const ciphertext = nacl.secretbox(peerPublicKey, nonce, masterKey);
      const blob = encodeBase64(new Uint8Array([...nonce, ...ciphertext]));
      const res = await fetch(`${apiBaseUrl}/keys/contacts/${peerId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ encrypted_public_key: blob }),
      });
      if (!res.ok) {
        appLog.warn("peer-key-service › contact key upload failed", {
          peerId,
          status: res.status,
        });
      } else {
        appLog.info("peer-key-service › contact key uploaded", { peerId });
      }
    } catch (error) {
      appLog.warn("peer-key-service › contact key upload error", { peerId, error });
    }
  }

  /**
   * Fetches all contact keys backed up by the auth user and decrypts them
   * using the provided master key. Returns a map of peerId → public key.
   * Called during re-login / new-device initialization, before
   * `preloadAllConversationKeys`, so that messages from guest peers are
   * immediately decryptable.
   */
  async fetchAndDecryptContactKeys(
    masterKey: Uint8Array,
    accessToken: string,
    apiBaseUrl: string
  ): Promise<Map<string, Uint8Array>> {
    const result = new Map<string, Uint8Array>();
    try {
      const res = await fetch(`${apiBaseUrl}/keys/contacts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        appLog.warn("peer-key-service › fetch contact keys failed", {
          status: res.status,
        });
        return result;
      }
      const entries = (await res.json()) as Array<{
        peer_id: string;
        encrypted_public_key: string;
      }>;
      for (const entry of entries) {
        try {
          const raw = decodeBase64(entry.encrypted_public_key);
          const nonce = raw.slice(0, nacl.secretbox.nonceLength);
          const ct = raw.slice(nacl.secretbox.nonceLength);
          const plaintext = nacl.secretbox.open(ct, nonce, masterKey);
          if (plaintext) {
            result.set(entry.peer_id, plaintext);
          } else {
            appLog.warn("peer-key-service › contact key decryption failed", {
              peerId: entry.peer_id,
            });
          }
        } catch {
          appLog.warn("peer-key-service › contact key parse error", {
            peerId: entry.peer_id,
          });
        }
      }
      appLog.info("peer-key-service › contact keys restored", {
        count: result.size,
      });
    } catch (error) {
      appLog.warn("peer-key-service › fetch contact keys error", { error });
    }
    return result;
  }

  getCredential(): SignedCredential | undefined {
    return this.credential;
  }

  getMySecretKey(): Uint8Array | undefined {
    return this.secretKey;
  }

  getMyPublicKey(): Uint8Array | undefined {
    return this.publicKey;
  }
}
