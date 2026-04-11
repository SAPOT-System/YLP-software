import {
    Conversation,
    GuestUser,
    Message,
    MessageType,
    Peer,
} from "@/features/shared";
import { chatLog } from "@/features/shared/utils/logger";
import { Collection, Database, Q } from "@nozbe/watermelondb";

chatLog.debug("[message-repository] module loaded");

/**
 * MessageRepository handles CRUD operations for messages in the database.
 */
export class MessageRepository {
  private messagesCollection: Collection<Message>;

  /**
   * Constructs a MessageRepository instance.
   * @param db The WatermelonDB database instance
   */
  constructor(private db: Database) {
    this.messagesCollection = db.get<Message>(Message.table);
    chatLog.info("chat › message repo constructed", { hasDatabase: Boolean(db) });
  }

  // TODO: make the content type flexible for other type of messages
  // TODO: make the parameter as destrcutured
  /**
   * Saves a new message to the database.
   * @param newMessage The message data (sender, content, conversation, optional messageId)
   * @returns Promise<Message> The saved message
   */
  async saveMessage(newMessage: {
    sender: GuestUser | Peer;
    content: string;
    conversation: Conversation;
    messageId?: string;
  }) {
    try {
      const savedMessage = await this.db.write(async () => {
        const message = await this.messagesCollection.create(
          (message: Message) => {
            if (newMessage.messageId) {
              message._raw.id = newMessage.messageId;
            }
            message.sender.set(newMessage.sender);
            message.conversation.set(newMessage.conversation);
            message.messageType = MessageType.TEXT;
            message.content = newMessage.content;
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

  /**
   * Queries messages by conversation id, with pagination support.
   * @param conversationId The conversation id
   * @param limit Max number of messages to return (default 50)
   * @param offset Number of messages to skip (default 0)
   * @returns Promise<Message[]> Array of messages
   */
  async queryMessagesByConversation(
    conversationId: string,
    limit = 50,
    offset = 0
  ) {
    try {
      return await this.messagesCollection
        .query(
          Q.where("conversation", conversationId),
          Q.sortBy("created_at", Q.desc),
          Q.skip(offset),
          Q.take(limit)
        )
        .fetch();
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

  /**
   * Queries all messages in the database.
   * @returns Promise<Message[]> Array of all messages
   */
  async queryAllMessages() {
    try {
      return await this.messagesCollection.query().fetch();
    } catch (error) {
      chatLog.error("chat › messages list failed", { error });
      throw error;
    }
  }

  /**
   * Gets destroy operations for all messages (for debugging/testing purposes).
   * @returns Promise<any[]> Array of destroy operations
   */
  async getAllMessageDestroyOps() {
    chatLog.debug("chat › message destroy ops requested");
    const records = await this.messagesCollection.query().fetch();

    return records.map((r) => r.prepareDestroyPermanently());
  }
}
