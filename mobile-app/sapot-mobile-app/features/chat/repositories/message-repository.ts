import {
  Conversation,
  GuestUser,
  Message,
  MessageType,
  Peer,
} from "@/features/shared/core/database";
import { chatLog } from "@/features/shared/core/utils/logger";
import { Collection, Database, Q } from "@nozbe/watermelondb";
import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import { ConversationKeyStore } from "./conversation-key-store";

chatLog.debug("[message-repository] module loaded");

// Re-exported for backward compatibility with existing importers.
export { ECDH_PREFIX } from "./conversation-key-store";

export class MessageRepository {
  private messagesCollection: Collection<Message>;

  constructor(private db: Database, private keyStore: ConversationKeyStore) {
    this.messagesCollection = db.get<Message>(Message.table);
    chatLog.info("chat › message repo constructed", { hasDatabase: Boolean(db) });
  }

  /** Delegate for GuestMigrationService, which holds a repo reference from before keyStore existed. */
  captureGuestKeysForMigration(): void {
    this.keyStore.captureGuestKeysForMigration();
  }

  hasMigrationKeys(): boolean {
    return this.keyStore.hasMigrationKeys();
  }

  tryDecryptWithMigrationKeys(content: string, conversationId: string): string | null {
    return this.keyStore.tryDecryptWithMigrationKeys(content, conversationId);
  }

  clearMigrationKeys(): void {
    this.keyStore.clearMigrationKeys();
  }

  onConversationKeySet(listener: (conversationId: string) => void): () => void {
    return this.keyStore.onConversationKeySet(listener);
  }

  /**
   * Re-encrypts all local messages using the current auth ECDH conversation keys.
   * Called after guest→auth migration once the auth keys are loaded in memory.
   */
  async reEncryptAfterMigration(): Promise<{ reEncrypted: number; skipped: number; skippedConvIds: string[] }> {
    chatLog.info("chat › reEncryptAfterMigration start");
    try {
      const allMessages = await this.messagesCollection.query().fetch();

      const updates: Array<{ message: Message; newContent: string }> = [];
      const skippedConvIds = new Set<string>();

      for (const message of allMessages) {
        const raw = message._raw as Record<string, string>;
        const conversationId = raw.conversation;

        let plaintext: string | null;
        if (!message.content.startsWith("ecdh:")) {
          plaintext = message.content;
        } else {
          plaintext = this.keyStore.tryDecryptWithMigrationKeys(message.content, conversationId);
          if (plaintext === null) {
            chatLog.warn("chat › reEncryptAfterMigration: could not decrypt message, skipping", {
              messageId: message.id,
              conversationId,
            });
            skippedConvIds.add(conversationId);
            continue;
          }
        }

        const authKey = this.keyStore.getCurrentKey(conversationId);
        if (!authKey) {
          skippedConvIds.add(conversationId);
          continue;
        }

        const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
        const ciphertext = nacl.secretbox(new TextEncoder().encode(plaintext), nonce, authKey);
        updates.push({
          message,
          newContent: "ecdh:" + encodeBase64(nonce) + ":" + encodeBase64(ciphertext),
        });
      }

      if (updates.length === 0 && skippedConvIds.size === 0) {
        chatLog.info("chat › reEncryptAfterMigration: nothing to re-encrypt");
        return { reEncrypted: 0, skipped: 0, skippedConvIds: [] };
      }

      if (updates.length > 0) {
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
      }

      chatLog.info("chat › reEncryptAfterMigration: summary", {
        reEncrypted: updates.length,
        skipped: skippedConvIds.size,
        skippedConvIds: [...skippedConvIds],
      });
      // NOTE: does NOT call clearMigrationKeys() — the caller is responsible.
      return { reEncrypted: updates.length, skipped: skippedConvIds.size, skippedConvIds: [...skippedConvIds] };
    } catch (error) {
      chatLog.error("chat › reEncryptAfterMigration failed", { error });
      throw error;
    }
  }

  async reEncryptConversation(conversationId: string): Promise<void> {
    const authKey = this.keyStore.getCurrentKey(conversationId);
    if (!authKey) return;

    const messages = await this.messagesCollection
      .query(Q.where("conversation", conversationId))
      .fetch();

    const updates: Array<{ message: Message; newContent: string }> = [];
    for (const message of messages) {
      let plaintext: string | null;
      if (!message.content.startsWith("ecdh:")) {
        plaintext = message.content;
      } else {
        plaintext = this.keyStore.tryDecryptWithMigrationKeys(message.content, conversationId);
        if (plaintext === null) continue;
      }

      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const ciphertext = nacl.secretbox(new TextEncoder().encode(plaintext), nonce, authKey);
      updates.push({
        message,
        newContent: "ecdh:" + encodeBase64(nonce) + ":" + encodeBase64(ciphertext),
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
    const key = this.keyStore.getCurrentKey(conversationId);
    if (!key) {
      if (allowPlaintext) {
        chatLog.warn("chat › no shared key, persisting incoming message as plaintext", { conversationId });
        return { content: plaintext, isEncrypted: false };
      }
      throw new Error(`Conversation key not yet derived for ${conversationId} — cannot encrypt outgoing message`);
    }
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const ciphertext = nacl.secretbox(new TextEncoder().encode(plaintext), nonce, key);
    return {
      content: "ecdh:" + encodeBase64(nonce) + ":" + encodeBase64(ciphertext),
      isEncrypted: true,
    };
  }

  private decryptContent(message: Message, conversationId?: string): string {
    const content = message.content;
    if (!content.startsWith("ecdh:")) return content;
    const convId = conversationId ?? (message._raw as Record<string, string>).conversation;
    const candidates = this.keyStore.getCandidateKeys(convId);
    if (candidates.length === 0) {
      chatLog.warn("chat › no shared key for decryption", { conversationId: convId, messageId: message.id });
      return content;
    }
    const inner = content.slice("ecdh:".length).split(":");
    if (inner.length !== 2) return content;
    const nonce = decodeBase64(inner[0]);
    const ciphertext = decodeBase64(inner[1]);
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
    allowPlaintext?: boolean;
    sentAt?: Date;
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
      message.createdAt = newMessage.sentAt ?? new Date();
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

  async decryptAllMessagesToPlaintext(): Promise<void> {
    try {
      const allMessages = await this.messagesCollection.query().fetch();
      const toUpdate = allMessages.filter((m) => m.content.startsWith("ecdh:"));
      if (toUpdate.length === 0) {
        chatLog.info("chat › decryptAllMessagesToPlaintext: no encrypted messages found");
        return;
      }

      const updates: Array<{ message: Message; plaintextStr: string }> = [];
      for (const message of toUpdate) {
        const convId = (message._raw as Record<string, string>).conversation;
        const candidates = this.keyStore.getCandidateKeys(convId);
        if (candidates.length === 0) {
          chatLog.warn("chat › decryptAllMessagesToPlaintext: no key for conversation, skipping message", {
            messageId: message.id,
            conversationId: convId,
          });
          continue;
        }
        const inner = message.content.slice("ecdh:".length).split(":");
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

      const { database } = await import("@/features/shared");

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

  decryptMessage(message: Message, conversationId?: string): string {
    return this.decryptContent(message, conversationId);
  }
}
