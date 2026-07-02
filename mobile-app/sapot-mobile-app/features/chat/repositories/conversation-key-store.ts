import { chatLog } from "@/features/shared/core/utils/logger";
import nacl from "tweetnacl";
import { decodeBase64 } from "tweetnacl-util";

chatLog.debug("[conversation-key-store] module loaded");

export const ECDH_PREFIX = "ecdh:";

const MAX_KEY_HISTORY = 5;

function keysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return a.every((byte, i) => byte === b[i]);
}

/**
 * Owns the in-memory key lifecycle for conversation encryption:
 * current key per conversation, bounded key history (max 5, newest-first,
 * de-duplicated), migration guest key snapshot, and key-change listeners.
 *
 * Extracted from MessageRepository so the crypto state machine is visible
 * and testable in isolation without a WatermelonDB database.
 */
export class ConversationKeyStore {
  private conversationKeys = new Map<string, Uint8Array>();
  private conversationKeyHistory = new Map<string, Uint8Array[]>();
  private migrationGuestKeys = new Map<string, Uint8Array>();
  private keySetListeners = new Set<(conversationId: string) => void>();

  setConversationKey(conversationId: string, sharedKey: Uint8Array): void {
    const previous = this.conversationKeys.get(conversationId);
    this.conversationKeys.set(conversationId, sharedKey);

    const history = this.conversationKeyHistory.get(conversationId) ?? [];
    const deduped = history.filter((k) => !keysEqual(k, sharedKey));
    deduped.unshift(sharedKey);
    if (deduped.length > MAX_KEY_HISTORY) deduped.length = MAX_KEY_HISTORY;
    this.conversationKeyHistory.set(conversationId, deduped);

    if (previous && !keysEqual(previous, sharedKey)) {
      chatLog.info("chat › conversation key changed; retaining previous key for decryption", {
        conversationId,
        candidateKeys: deduped.length,
      });
    }
    this.keySetListeners.forEach((l) => l(conversationId));
  }

  getCandidateKeys(conversationId: string): Uint8Array[] {
    const history = this.conversationKeyHistory.get(conversationId);
    if (history && history.length > 0) return history;
    const current = this.conversationKeys.get(conversationId);
    return current ? [current] : [];
  }

  getCurrentKey(conversationId: string): Uint8Array | undefined {
    return this.conversationKeys.get(conversationId);
  }

  onConversationKeySet(listener: (conversationId: string) => void): () => void {
    this.keySetListeners.add(listener);
    return () => this.keySetListeners.delete(listener);
  }

  clearConversationKeys(): void {
    this.conversationKeys.clear();
    this.conversationKeyHistory.clear();
  }

  captureGuestKeysForMigration(): void {
    this.migrationGuestKeys = new Map(this.conversationKeys);
    chatLog.info("chat › guest conversation keys captured for migration", {
      conversationCount: this.migrationGuestKeys.size,
    });
  }

  hasMigrationKeys(): boolean {
    return this.migrationGuestKeys.size > 0;
  }

  tryDecryptWithMigrationKeys(content: string, conversationId: string): string | null {
    if (!content.startsWith(ECDH_PREFIX)) return content;
    const key = this.migrationGuestKeys.get(conversationId);
    if (!key) return null;
    const inner = content.slice(ECDH_PREFIX.length).split(":");
    if (inner.length !== 2) return null;
    try {
      const nonce = decodeBase64(inner[0]);
      const ciphertext = decodeBase64(inner[1]);
      const plaintext = nacl.secretbox.open(ciphertext, nonce, key);
      if (!plaintext) return null;
      return new TextDecoder().decode(plaintext);
    } catch {
      return null;
    }
  }

  clearMigrationKeys(): void {
    this.migrationGuestKeys.clear();
    chatLog.info("chat › migration guest keys cleared");
  }
}
