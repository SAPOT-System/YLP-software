import { Conversation, ConversationType } from "@/features/shared";
import { Collection, Database, Q } from "@nozbe/watermelondb";

export class ConversationRepository {
  conversationCollections: Collection<Conversation>;
  constructor(private db: Database) {
    this.conversationCollections = this.db.get<Conversation>(Conversation.table);
  }

  async saveConversation(
    newConversation: { type: ConversationType },
    isInTransaction = false
  ) {
    try {
      const action = async () => {
        return await this.conversationCollections.create((conversation) => {
          conversation.type = newConversation.type;
          conversation.createdAt = new Date();
          conversation.isDeleted = false;
          // conversation.name = newConversation.name;
          // conversation.updatedAt = newConversation.unreadCount;
        });
      };
      if (isInTransaction) {
        return action();
      } else {
        return this.conversationCollections.database.write(action);
      }
    } catch (error) {
      console.error(
        "[ConversationRepository]: Error creating conversation:",
        error
      );
      throw error;
    }
  }

  // TODO: have a logic when the there is no result
  async isDirectConversation(chatId: string) {
    try {
      const result = await this.conversationCollections.query(
        Q.where("id", chatId)
      );

      return result[0].type === ConversationType.DIRECT ? true : false;
    } catch (error) {
      console.error(
        "[ConversationRepository]: Error finding if conversation exist:",
        error
      );
      throw error;
    }
  }

  async queryAllConversation() {
    try {
      return (await this.conversationCollections.query().fetch()) || [];
    } catch (error) {
      console.error(
        "[ConversationRepository]: Error finding if conversation exist:",
        error
      );
      throw error;
    }
  }

  // Note: find method will return error if this conversation id does not exist
  // TODO: change find method into query method
  async queryConversationById(chatId: string) {
    try {
      return await this.conversationCollections.find(chatId);
    } catch (error) {
      console.error(
        "[ConversationRepository]: Error finding conversation by id:",
        error
      );
      throw error;
    }
  }
}
