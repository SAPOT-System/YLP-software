import { Conversation, ConversationType } from "@/features/shared";
import { chatLog } from "@/features/shared/utils/logger";
import { Collection, Database, Q } from "@nozbe/watermelondb";

chatLog.debug("[conversation-repository] module loaded");

/**
 * ConversationRepository manages CRUD operations for conversations in the database.
 */
export class ConversationRepository {
  conversationCollections: Collection<Conversation>;
  /**
   * Constructs a ConversationRepository instance.
   * @param db The WatermelonDB database instance
   */
  constructor(private db: Database) {
    this.conversationCollections = this.db.get<Conversation>(
      Conversation.table
    );
    chatLog.info("chat › conversation repo constructed", {
      hasDatabase: Boolean(db),
    });
  }

  /**
   * Saves a new conversation to the database.
   * @param newConversation The conversation data (type, optional id)
   * @param isInTransaction Whether to run in an existing transaction
   * @returns Promise<Conversation> The saved conversation
   */
  async saveConversation(
    newConversation: { type: ConversationType; id?: string; title?: string },
    isInTransaction = false
  ) {
    try {
      const action = async () => {
        return await this.conversationCollections.create((conversation) => {
          if (newConversation.id) {
            conversation._raw.id = newConversation.id;
          }

          conversation.type = newConversation.type;
          conversation.createdAt = new Date();
          conversation.updatedAt = new Date();
          conversation.isDeleted = false;
          if (newConversation.title) {
            conversation.title = newConversation.title;
          }
        });
      };
      if (isInTransaction) {
        return action();
      } else {
        return this.conversationCollections.database.write(action);
      }
    } catch (error) {
      chatLog.error("chat › conversation save failed", {
        conversationId: newConversation.id,
        type: newConversation.type,
        isInTransaction,
        error,
      });
      throw error;
    }
  }

  // TODO: have a logic when the there is no result
  /**
   * Checks if a conversation is a direct conversation by id.
   * @param chatId The conversation id
   * @returns Promise<boolean> True if direct, false otherwise
   */
  async isDirectConversation(chatId: string) {
    try {
      const result = await this.conversationCollections.query(
        Q.where("id", chatId)
      );

      return result[0].type === ConversationType.DIRECT ? true : false;
    } catch (error) {
      chatLog.error("chat › direct check failed", { conversationId: chatId, error });
      throw error;
    }
  }

  /**
   * Queries all conversations in the database.
   * @returns Promise<Conversation[]> Array of all conversations
   */
  async queryAllConversation() {
    try {
      return (await this.conversationCollections.query().fetch()) || [];
    } catch (error) {
      chatLog.error("chat › conversation list failed", { error });
      throw error;
    }
  }

  /**
   * Checks if a conversation exists by id.
   * @param id The conversation id
   * @returns Promise<boolean> True if exists, false otherwise
   */
  async isConversationExist(id: string) {
    try {
      const conversation = await this.conversationCollections
        .query(Q.where("id", id))
        .fetch();

      return conversation.length > 0;
    } catch (error) {
      chatLog.error("chat › conversation exists check failed", {
        conversationId: id,
        error,
      });
      throw error;
    }
  }

  /**
   * Queries a conversation by id.
   * @param id The conversation id
   * @returns Promise<Conversation | undefined> The conversation or undefined
   */
  async queryConversationById(id: string) {
    try {
      const conversation = await this.conversationCollections
        .query(Q.where("id", id))
        .fetch();
      // TODO: make a logic to return nothing if id is not exists
      return conversation[0];
    } catch (error) {
      chatLog.error("chat › conversation query failed", {
        conversationId: id,
        error,
      });
      throw error;
    }
  }

  async touchConversation(id: string): Promise<void> {
    try {
      const [conversation] = await this.conversationCollections
        .query(Q.where("id", id))
        .fetch();
      if (!conversation) return;
      await this.conversationCollections.database.write(async () => {
        await conversation.update((record) => {
          record.updatedAt = new Date();
        });
      });
    } catch (error) {
      chatLog.error("chat › touch conversation failed", { conversationId: id, error });
    }
  }

  /**
   * Gets destroy operations for all conversations (for debugging/testing purposes).
   * @returns Promise<any[]> Array of destroy operations
   */
  async getConversationDestroyOps() {
    const records = await this.conversationCollections.query().fetch();
    chatLog.debug("chat › conversation destroy ops", {
      count: records.length,
    });

    return records.map((r) => r.prepareDestroyPermanently());
  }
}
