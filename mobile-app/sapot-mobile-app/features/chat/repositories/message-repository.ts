import {
  Conversation,
  GuestUser,
  Message,
  MessageType,
  Peer,
} from "@/features/shared";
import { LocalEncryptionService } from "@/features/shared/services/local-encryption-service";
import { chatLog } from "@/features/shared/utils/logger";
import { Collection, Database, Q } from "@nozbe/watermelondb";

chatLog.debug("[message-repository] module loaded");

export class MessageRepository {
  private messagesCollection: Collection<Message>;

  constructor(
    private db: Database,
    private encryptionService?: LocalEncryptionService
  ) {
    this.messagesCollection = db.get<Message>(Message.table);
    chatLog.info("chat › message repo constructed", {
      hasDatabase: Boolean(db),
      hasEncryption: Boolean(encryptionService),
    });
  }

  private encryptContent(plaintext: string): { content: string; isEncrypted: boolean } {
    if (!this.encryptionService) return { content: plaintext, isEncrypted: false };
    return { content: this.encryptionService.encrypt(plaintext), isEncrypted: true };
  }

  private decryptContent(message: Message): string {
    if (!message.isEncrypted || !this.encryptionService) return message.content;
    try {
      return this.encryptionService.decrypt(message.content);
    } catch (error) {
      chatLog.error("chat › message decrypt failed", { messageId: message.id, error });
      return message.content;
    }
  }

  prepareMessageCreate(newMessage: {
    sender: GuestUser | Peer;
    content: string;
    conversation: Conversation;
    messageId?: string;
    messageType?: MessageType;
    linkedMessageId?: string;
  }): Message {
    const { content, isEncrypted } = this.encryptContent(newMessage.content);
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
      const { content, isEncrypted } = this.encryptContent(newMessage.content);
      const savedMessage = await this.db.write(async () => {
        const message = await this.messagesCollection.create(
          (message: Message) => {
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
          }
        );
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

  async queryMessagesByConversation(
    conversationId: string,
    limit = 50,
    offset = 0
  ) {
    try {
      const messages = await this.messagesCollection
        .query(
          Q.where("conversation", conversationId),
          Q.sortBy("created_at", Q.desc),
          Q.skip(offset),
          Q.take(limit)
        )
        .fetch();
      return messages.map((msg) => this.withDecryptedContent(msg));
    } catch (error) {
      chatLog.error("chat › messages query failed", {
        conversationId,
        limit,
        offset,
        error,
      });
      throw error;
    }
  }

  async queryMessageById(messageId: string): Promise<Message | undefined> {
    try {
      const messages = await this.messagesCollection
        .query(Q.where("id", messageId))
        .fetch();
      if (messages.length === 0) return undefined;
      return this.withDecryptedContent(messages[0]);
    } catch (error) {
      chatLog.error("chat › message query by id failed", {
        messageId,
        error,
      });
      throw error;
    }
  }

  async queryMessagesByConversationAndSender(
    conversationId: string,
    senderId: string
  ): Promise<Message[]> {
    try {
      const messages = await this.messagesCollection
        .query(
          Q.where("conversation", conversationId),
          Q.where("sender", senderId)
        )
        .fetch();
      return messages.map((msg) => this.withDecryptedContent(msg));
    } catch (error) {
      chatLog.error("chat › messages by conversation+sender failed", {
        conversationId,
        senderId,
        error,
      });
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

  private withDecryptedContent(message: Message): Message {
    const plaintext = this.decryptContent(message);
    if (plaintext === message.content) return message;
    // Return a lightweight proxy with decrypted content without modifying the DB record
    return Object.create(message, {
      content: { value: plaintext, enumerable: true, configurable: true },
    }) as Message;
  }
}
