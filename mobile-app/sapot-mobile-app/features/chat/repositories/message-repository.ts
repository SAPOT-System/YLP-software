import {
  Conversation,
  GuestUser,
  Message,
  MessageType,
  Peer,
} from "@/features/shared";
import { chatLog } from "@/features/shared/utils/logger";
import { Collection, Database, Q } from "@nozbe/watermelondb";
import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";

chatLog.debug("[message-repository] module loaded");

export const ECDH_PREFIX = "ecdh:";

/** Max number of historical conversation keys retained per conversation so that
 *  ciphertext encrypted under a previous peer key (e.g. before the peer's ECDH
 *  key rotated) remains decryptable after the key is re-derived. */
const MAX_KEY_HISTORY = 5;

function keysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return a.every((byte, i) => byte === b[i]);
}

export class MessageRepository {
  private messagesCollection: Collection<Message>;
  /** The current (primary) key per conversation — used to encrypt new messages. */
  private conversationKeys = new Map<string, Uint8Array>();
  /** All keys ever derived per conversation (newest first) — tried in order when
   *  decrypting so that history survives a peer key rotation. */
  private conversationKeyHistory = new Map<string, Uint8Array[]>();
  private migrationGuestKeys = new Map<string, Uint8Array>();
  private keySetListeners = new Set<(conversationId: string) => void>();

  constructor(private db: Database) {
    this.messagesCollection = db.get<Message>(Message.table);
    chatLog.info("chat › message repo constructed", { hasDatabase: Boolean(db) });
  }

  setConversationKey(conversationId: string, sharedKey: Uint8Array): void {
    const previous = this.conversationKeys.get(conversationId);
    this.conversationKeys.set(conversationId, sharedKey);

    // Maintain a bounded, de-duplicated history of keys (newest first). Without
    // this, re-deriving the key on a TCP handshake (e.g. after the peer's app
    // ECDH key changed) would overwrite the only key and turn previously stored
    // ciphertext into un-decryptable blanks. Keeping past keys lets decryptContent
    // still open older messages while new ones use the current key.
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

  /**
   * Returns all candidate keys for a conversation (current first, then history),
   * used to attempt decryption. Falls back to the single current key if no
   * history has been recorded.
   */
  private getCandidateKeys(conversationId: string): Uint8Array[] {
    const history = this.conversationKeyHistory.get(conversationId);
    if (history && history.length > 0) return history;
    const current = this.conversationKeys.get(conversationId);
    return current ? [current] : [];
  }

  /** Subscribe to conversation key updates. Returns an unsubscribe function. */
  onConversationKeySet(listener: (conversationId: string) => void): () => void {
    this.keySetListeners.add(listener);
    return () => this.keySetListeners.delete(listener);
  }

  /** Clears all in-memory conversation keys. Called on guest→auth migration so
   *  stale guest-derived keys are not used once the auth ECDH keypair is active. */
  clearConversationKeys(): void {
    this.conversationKeys.clear();
    this.conversationKeyHistory.clear();
  }

  /**
   * Snapshots the current guest conversation keys so they can be used to
   * decrypt server-stored ciphertext during the first post-migration sync.
   * Must be called during guest→auth migration while the guest ECDH keypair
   * is still live in `conversationKeys` (i.e., before `clearConversationKeys()`).
   */
  captureGuestKeysForMigration(): void {
    this.migrationGuestKeys = new Map(this.conversationKeys);
    chatLog.info("chat › guest conversation keys captured for migration", {
      conversationCount: this.migrationGuestKeys.size,
    });
  }

  /** Returns true if migration guest keys are present, indicating a
   *  guest→auth migration just occurred and re-encryption is needed. */
  hasMigrationKeys(): boolean {
    return this.migrationGuestKeys.size > 0;
  }

  /**
   * Tries to decrypt an `ecdh:`-prefixed message using the captured guest keys.
   * Returns the plaintext string on success, or null if the key is missing or
   * decryption fails. Returns the input unchanged if it does not start with
   * the `ecdh:` prefix (i.e., it is already plaintext).
   */
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

  /** Clears the migration guest key snapshot. Called after re-encryption completes. */
  clearMigrationKeys(): void {
    this.migrationGuestKeys.clear();
    chatLog.info("chat › migration guest keys cleared");
  }

  /**
   * Re-encrypts all local messages using the current auth ECDH conversation keys.
   * Called after guest→auth migration once the auth keys are loaded in memory.
   *
   * Handles two cases:
   *   1. Plaintext messages (`is_encrypted = false` or no `ecdh:` prefix) — encrypted
   *      with the current auth conversation key so the server receives K_AB′ ciphertext.
   *   2. Legacy `ecdh:`-prefixed messages that survived the migration (e.g. pulled from
   *      server after migration) — first decrypted using the captured guest keys, then
   *      re-encrypted with the auth conversation key.
   *
   * Messages whose auth conversation key is not yet available are left unchanged;
   * they will remain as plaintext or legacy ciphertext until the peer reconnects
   * and `rederiveKeyForPeer` supplies the missing key.
   */
  async reEncryptAfterMigration(): Promise<{ reEncrypted: number; skipped: number; skippedConvIds: string[] }> {
    chatLog.info("chat › reEncryptAfterMigration start");
    try {
      const allMessages = await this.messagesCollection.query().fetch();

      // Pre-compute { message, newContent } pairs BEFORE calling prepareUpdate.
      // WatermelonDB requires that prepareUpdate() and batch() are called in the
      // same synchronous execution frame — any `await` between them lets the
      // WatermelonDB safety microtask fire first, which throws an invariant error.
      // By pre-computing ciphertext here we can use a plain (non-async) write()
      // callback below where prepareUpdate → batch is truly synchronous.
      const updates: Array<{ message: Message; newContent: string }> = [];
      const skippedConvIds = new Set<string>();

      for (const message of allMessages) {
        const raw = message._raw as Record<string, string>;
        const conversationId = raw.conversation;

        // Step 1: determine plaintext
        let plaintext: string | null;
        if (!message.content.startsWith(ECDH_PREFIX)) {
          // Already plaintext (decrypted during migration step 1)
          plaintext = message.content;
        } else {
          // Try to decrypt with migration guest keys (server-only messages)
          plaintext = this.tryDecryptWithMigrationKeys(message.content, conversationId);
          if (plaintext === null) {
            chatLog.warn("chat › reEncryptAfterMigration: could not decrypt message, skipping", {
              messageId: message.id,
              conversationId,
            });
            skippedConvIds.add(conversationId);
            continue;
          }
        }

        // Step 2: encrypt with the current auth conversation key
        const authKey = this.conversationKeys.get(conversationId);
        if (!authKey) {
          // Leave as-is — retried when peer key arrives via onConversationKeySet
          skippedConvIds.add(conversationId);
          continue;
        }

        const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
        const ciphertext = nacl.secretbox(new TextEncoder().encode(plaintext), nonce, authKey);
        updates.push({
          message,
          newContent: ECDH_PREFIX + encodeBase64(nonce) + ":" + encodeBase64(ciphertext),
        });
      }

      if (updates.length === 0 && skippedConvIds.size === 0) {
        chatLog.info("chat › reEncryptAfterMigration: nothing to re-encrypt");
        return { reEncrypted: 0, skipped: 0, skippedConvIds: [] };
      }

      if (updates.length > 0) {
        // Import database before the write so there is no await inside the callback.
        const { database } = await import("@/features/shared");

        // Synchronous write callback: prepareUpdate() and batch() are in the same
        // execution frame with no await between them.
        await database.write(() => {
          const ops = updates.map(({ message, newContent }) =>
            message.prepareUpdate((m: Message) => {
              m.content = newContent;
              m.isEncrypted = true;
            })
          );
          return database.batch(...ops);
        });
      }

      chatLog.info("chat › reEncryptAfterMigration: summary", {
        reEncrypted: updates.length,
        skipped: skippedConvIds.size,
        skippedConvIds: [...skippedConvIds],
      });
      // NOTE: does NOT call clearMigrationKeys() — the caller is responsible.
      // Keys must remain alive until after the first sync pull so that
      // normalizePullChanges can decrypt server-only ecdh:K_AB messages.
      return { reEncrypted: updates.length, skipped: skippedConvIds.size, skippedConvIds: [...skippedConvIds] };
    } catch (error) {
      chatLog.error("chat › reEncryptAfterMigration failed", { error });
      throw error;
    }
  }

  /**
   * Re-encrypts the messages of a single conversation using the current auth
   * conversation key. Called when a key arrives late (peer connects after the
   * initial reEncryptAfterMigration pass).
   *
   * Mirrors reEncryptAfterMigration's per-message logic so that no message is
   * stranded as guest-key ciphertext:
   *   - plaintext messages → encrypted with the auth key.
   *   - guest-key `ecdh:` ciphertext (e.g. pulled from the server) → decrypted
   *     with the captured migration keys, then re-encrypted with the auth key.
   *   - messages the guest keys cannot open (already auth-encrypted, or no key)
   *     are left unchanged.
   */
  async reEncryptConversation(conversationId: string): Promise<void> {
    const authKey = this.conversationKeys.get(conversationId);
    if (!authKey) return;

    const messages = await this.messagesCollection
      .query(Q.where("conversation", conversationId))
      .fetch();

    const updates: Array<{ message: Message; newContent: string }> = [];
    for (const message of messages) {
      // Determine plaintext for this message.
      let plaintext: string | null;
      if (!message.content.startsWith(ECDH_PREFIX)) {
        plaintext = message.content;
      } else {
        // ecdh:-prefixed — try the captured guest keys. Returns null when the
        // content is already auth-encrypted or no guest key is available, in
        // which case we leave the message unchanged.
        plaintext = this.tryDecryptWithMigrationKeys(message.content, conversationId);
        if (plaintext === null) continue;
      }

      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const ciphertext = nacl.secretbox(new TextEncoder().encode(plaintext), nonce, authKey);
      updates.push({
        message,
        newContent: ECDH_PREFIX + encodeBase64(nonce) + ":" + encodeBase64(ciphertext),
      });
    }

    if (updates.length === 0) return;

    const { database } = await import("@/features/shared");
    await database.write(() => {
      const ops = updates.map(({ message, newContent }) =>
        message.prepareUpdate((m: Message) => {
          m.content = newContent;
          m.isEncrypted = true;
        })
      );
      return database.batch(...ops);
    });

    chatLog.info("chat › reEncryptConversation: complete", { conversationId, count: updates.length });
  }

  private encryptContent(
    plaintext: string,
    conversationId: string,
    { allowPlaintext = false } = {}
  ): { content: string; isEncrypted: boolean } {
    const key = this.conversationKeys.get(conversationId);
    if (!key) {
      if (allowPlaintext) {
        // Incoming message path: persist even if the key isn't ready yet so
        // the message isn't lost. isEncrypted=false signals it needs no decryption.
        chatLog.warn("chat › no shared key, persisting incoming message as plaintext", { conversationId });
        return { content: plaintext, isEncrypted: false };
      }
      // Outgoing message path: refuse to commit a message without encryption.
      // ChatService.sendChatMessage will catch this, mark the message NOT_SENT,
      // and let the user retry once the TCP handshake completes.
      throw new Error(`Conversation key not yet derived for ${conversationId} — cannot encrypt outgoing message`);
    }
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const ciphertext = nacl.secretbox(new TextEncoder().encode(plaintext), nonce, key);
    return {
      content: ECDH_PREFIX + encodeBase64(nonce) + ":" + encodeBase64(ciphertext),
      isEncrypted: true,
    };
  }

  private decryptContent(message: Message, conversationId?: string): string {
    const content = message.content;
    if (!content.startsWith(ECDH_PREFIX)) return content;
    const convId = conversationId ?? (message._raw as Record<string, string>).conversation;
    const candidates = this.getCandidateKeys(convId);
    if (candidates.length === 0) {
      chatLog.warn("chat › no shared key for decryption", { conversationId: convId, messageId: message.id });
      return content;
    }
    const inner = content.slice(ECDH_PREFIX.length).split(":");
    if (inner.length !== 2) return content;
    const nonce = decodeBase64(inner[0]);
    const ciphertext = decodeBase64(inner[1]);
    // Try the current key first, then any retained historical keys so that
    // messages encrypted before a peer key rotation remain readable.
    for (const key of candidates) {
      const plaintext = nacl.secretbox.open(ciphertext, nonce, key);
      if (plaintext) return new TextDecoder().decode(plaintext);
    }
    chatLog.warn("chat › message decryption failed with all candidate keys", {
      messageId: message.id,
      candidateKeys: candidates.length,
    });
    return content;
  }

  prepareMessageCreate(newMessage: {
    sender: GuestUser | Peer;
    content: string;
    conversation: Conversation;
    messageId?: string;
    messageType?: MessageType;
    linkedMessageId?: string;
    /** Set to true for messages received from a peer — allows plaintext fallback
     *  when the conversation key is not yet derived so the message is not lost. */
    allowPlaintext?: boolean;
  }): Message {
    const isSms = newMessage.messageType === MessageType.SMS;
    const { content, isEncrypted } = this.encryptContent(
      newMessage.content,
      newMessage.conversation.id,
      { allowPlaintext: (newMessage.allowPlaintext ?? false) || isSms }
    );
    return this.messagesCollection.prepareCreate((message: Message) => {
      if (newMessage.messageId) {
        message._raw.id = newMessage.messageId;
      }
      message.sender.set(newMessage.sender);
      message.conversation.set(newMessage.conversation);
      message.messageType = newMessage.messageType ?? MessageType.TEXT;
      message.content = content;
      message.isEncrypted = isEncrypted;
      message.linkedMessageId = newMessage.linkedMessageId ?? null;
      message.createdAt = new Date();
      message.updatedAt = new Date();
      message.isDeleted = false;
    });
  }

  async saveMessage(newMessage: {
    sender: GuestUser | Peer;
    content: string;
    conversation: Conversation;
    messageId?: string;
    messageType?: MessageType;
  }) {
    try {
      const { content, isEncrypted } = this.encryptContent(newMessage.content, newMessage.conversation.id);
      const savedMessage = await this.db.write(async () => {
        const message = await this.messagesCollection.create((message: Message) => {
          if (newMessage.messageId) {
            message._raw.id = newMessage.messageId;
          }
          message.sender.set(newMessage.sender);
          message.conversation.set(newMessage.conversation);
          message.messageType = newMessage.messageType ?? MessageType.TEXT;
          message.content = content;
          message.isEncrypted = isEncrypted;
          message.createdAt = new Date();
          message.updatedAt = new Date();
          message.isDeleted = false;
        });
        return message;
      });
      return savedMessage;
    } catch (error) {
      chatLog.error("chat › message save failed", {
        conversationId: newMessage.conversation.id,
        messageId: newMessage.messageId,
        hasContent: Boolean(newMessage.content),
        error,
      });
      throw error;
    }
  }

  async queryMessagesByConversation(conversationId: string, limit = 50, offset = 0) {
    try {
      const messages = await this.messagesCollection
        .query(
          Q.where("conversation", conversationId),
          Q.sortBy("created_at", Q.desc),
          Q.skip(offset),
          Q.take(limit)
        )
        .fetch();
      return messages.map((msg) => this.withDecryptedContent(msg, conversationId));
    } catch (error) {
      chatLog.error("chat › messages query failed", { conversationId, limit, offset, error });
      throw error;
    }
  }

  async queryMessageById(messageId: string): Promise<Message | undefined> {
    try {
      const messages = await this.messagesCollection.query(Q.where("id", messageId)).fetch();
      if (messages.length === 0) return undefined;
      return this.withDecryptedContent(messages[0]);
    } catch (error) {
      chatLog.error("chat › message query by id failed", { messageId, error });
      throw error;
    }
  }

  async queryMessagesByConversationAndSender(conversationId: string, senderId: string): Promise<Message[]> {
    try {
      const messages = await this.messagesCollection
        .query(
          Q.where("conversation", conversationId),
          Q.where("sender", senderId)
        )
        .fetch();
      return messages.map((msg) => this.withDecryptedContent(msg, conversationId));
    } catch (error) {
      chatLog.error("chat › messages by conversation+sender failed", { conversationId, senderId, error });
      throw error;
    }
  }

  async queryAllMessages() {
    try {
      const messages = await this.messagesCollection.query().fetch();
      return messages.map((msg) => this.withDecryptedContent(msg));
    } catch (error) {
      chatLog.error("chat › messages list failed", { error });
      throw error;
    }
  }

  async getAllMessageDestroyOps() {
    chatLog.debug("chat › message destroy ops requested");
    const records = await this.messagesCollection.query().fetch();
    return records.map((r) => r.prepareDestroyPermanently());
  }

  /**
   * Decrypts every `ecdh:`-prefixed message in the database to plaintext using
   * the conversation keys currently held in memory, then writes them back with
   * `isEncrypted = false`.
   *
   * Called during guest→auth migration, when the guest-session conversation keys
   * are still live in memory. After migration the MainContainer re-initialises
   * with the auth ECDH keypair, which would derive *different* conversation keys
   * and make the old ciphertext unreadable. Stripping the encryption in-place
   * before that happens preserves message history across the identity change.
   */
  async decryptAllMessagesToPlaintext(): Promise<void> {
    if (this.conversationKeys.size === 0) {
      chatLog.warn("chat › decryptAllMessagesToPlaintext: no conversation keys in memory, skipping");
      return;
    }
    try {
      const allMessages = await this.messagesCollection.query().fetch();
      const toUpdate = allMessages.filter((m) => m.content.startsWith(ECDH_PREFIX));
      if (toUpdate.length === 0) {
        chatLog.info("chat › decryptAllMessagesToPlaintext: no encrypted messages found");
        return;
      }

      // Pre-compute { message, plaintextStr } pairs BEFORE calling prepareUpdate.
      // WatermelonDB requires prepareUpdate() and batch() to be in the same
      // synchronous execution frame. Any await between them lets the WatermelonDB
      // safety microtask fire first, causing an invariant error.
      const updates: Array<{ message: Message; plaintextStr: string }> = [];
      for (const message of toUpdate) {
        const convId = (message._raw as Record<string, string>).conversation;
        const candidates = this.getCandidateKeys(convId);
        if (candidates.length === 0) {
          chatLog.warn("chat › decryptAllMessagesToPlaintext: no key for conversation, skipping message", {
            messageId: message.id,
            conversationId: convId,
          });
          continue;
        }
        const inner = message.content.slice(ECDH_PREFIX.length).split(":");
        if (inner.length !== 2) continue;
        const nonce = decodeBase64(inner[0]);
        const ciphertext = decodeBase64(inner[1]);
        let plaintext: Uint8Array | null = null;
        for (const key of candidates) {
          plaintext = nacl.secretbox.open(ciphertext, nonce, key);
          if (plaintext) break;
        }
        if (!plaintext) {
          chatLog.warn("chat › decryptAllMessagesToPlaintext: decryption failed for message", {
            messageId: message.id,
          });
          continue;
        }
        updates.push({ message, plaintextStr: new TextDecoder().decode(plaintext) });
      }

      if (updates.length === 0) return;

      // Import database before the write so there is no await inside the callback.
      const { database } = await import("@/features/shared");

      // Synchronous write callback: prepareUpdate() and batch() are in the same
      // execution frame with no await between them.
      await database.write(() => {
        const ops = updates.map(({ message, plaintextStr }) =>
          message.prepareUpdate((m: Message) => {
            m.content = plaintextStr;
            m.isEncrypted = false;
          })
        );
        return database.batch(...ops);
      });

      chatLog.info("chat › decryptAllMessagesToPlaintext: complete", {
        decrypted: updates.length,
        skipped: toUpdate.length - updates.length,
      });
    } catch (error) {
      chatLog.error("chat › decryptAllMessagesToPlaintext failed", { error });
      throw error;
    }
  }

  private withDecryptedContent(message: Message, conversationId?: string): Message {
    const plaintext = this.decryptContent(message, conversationId);
    if (plaintext === message.content) return message;
    return Object.create(message, {
      content: { value: plaintext, enumerable: true, configurable: true },
    }) as Message;
  }

  /**
   * Decrypts the content of a message using the stored conversation ECDH key.
   * Returns plaintext if the key is available, or the raw content if not (e.g. key not yet derived).
   */
  decryptMessage(message: Message, conversationId?: string): string {
    return this.decryptContent(message, conversationId);
  }
}
