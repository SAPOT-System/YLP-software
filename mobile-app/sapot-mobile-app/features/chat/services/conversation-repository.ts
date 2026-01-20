import { Chat, ChatType } from "@/features/shared";
import { Collection, Database, Q } from "@nozbe/watermelondb";

export class ConversationRepository {
  chatCollections: Collection<Chat>;
  constructor(private db: Database) {
    this.chatCollections = this.db.get<Chat>("chats");
  }

  async createRepository(newChat: { type: ChatType }, isInTransaction = false) {
    try {
      const action = async () => {
        return await this.chatCollections.create((chat) => {
          chat.type = newChat.type;
          chat.createdAt = new Date();
          chat.updatedAt = new Date();
          // chat.name = newChat.name;
          // chat.updatedAt = newChat.unreadCount;
        });
      };
      if (isInTransaction) {
        return action();
      } else {
        return this.chatCollections.database.write(action);
      }
    } catch (error) {
      console.error("[ConversationRepository]: Error creating chat:", error);
      throw error;
    }
  }

// TODO: have a logic when the there is no result
  async isDirectChat(chatId: string) {
    try {
      const result = await this.chatCollections.query(Q.where("id", chatId));

      return result[0].type === ChatType.DIRECT ? true : false;
    } catch (error) {
      console.error("[ConversationRepository]: Error finding if chat exist:", error);
      throw error;
    }
  }

  async queryAllChats() {
    try {
      return (await this.chatCollections.query().fetch()) || [];
    } catch (error) {
      console.error("[ConversationRepository]: Error finding if chat exist:", error);
      throw error;
    }
  }

  // Note: find method will return error if this chat id does not exist
  // TODO: change find method into query method
  async findChatById(chatId: string) {
    try {
      return await this.chatCollections.find(chatId);
    } catch (error) {
      console.error("[ConversationRepository]: Error finding chat by id:", error);
      throw error;
    }
  }
}
