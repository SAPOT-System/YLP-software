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

const ECDH_PREFIX = "ecdh:";

export class MessageRepository {
  private messagesCollection: Collection<Message>;
  private conversationKeys = new Map<string, Uint8Array>();

  constructor(private db: Database) {
    this.messagesCollection = db.get<Message>(Message.table);
    chatLog.info("chat › message repo constructed", { hasDatabase: Boolean(db) });
  }

  setConversationKey(conversationId: string, sharedKey: Uint8Array): void {
    this.conversationKeys.set(conversationId, sharedKey);
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
    const key = this.conversationKeys.get(convId);
    if (!key) {
      chatLog.warn("chat › no shared key for decryption", { conversationId: convId, messageId: message.id });
      return content;
    }
    const inner = content.slice(ECDH_PREFIX.length).split(":");
    if (inner.length !== 2) return content;
    const nonce = decodeBase64(inner[0]);
    const ciphertext = decodeBase64(inner[1]);
    const plaintext = nacl.secretbox.open(ciphertext, nonce, key);
    if (!plaintext) {
      chatLog.warn("chat › message decryption failed", { messageId: message.id });
      return content;
    }
    return new TextDecoder().decode(plaintext);
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
    const { content, isEncrypted } = this.encryptContent(
      newMessage.content,
      newMessage.conversation.id,
      { allowPlaintext: newMessage.allowPlaintext ?? false }
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
