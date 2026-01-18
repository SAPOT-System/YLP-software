import { Chat, ChatType } from "@/features/shared";
import { Collection, Database } from "@nozbe/watermelondb";

export class ChatRepository {
  private chatCollections: Collection<Chat>;
  constructor(private db: Database) {
    this.chatCollections = this.db.get<Chat>("chats");
  }

  async createRepository(newChat: { type: ChatType }) {
    try {
      return await this.chatCollections.create((chat) => {
        chat.type = newChat.type;
        chat.createdAt = new Date();
        chat.updatedAt = new Date();
        // chat.name = newChat.name;
        // chat.updatedAt = newChat.unreadCount;
      });
    } catch (error) {
      console.error("[ChatRepository]: Error creating chat:", error);
      throw error;
    }
  }

  async isChatExist(peerIds: string[]) {
    try {
        
    } catch (error) {
      console.error("[ChatRepository]: Error finding if chat exist:", error);
      throw error;
    }
    return true;
  }

  async getChatById(chatId: string) {
    try {
      // return await this.db.
    } catch (error) {
      console.error("[ChatRepository]: Error querying chat messages:", error);
      throw error;
    }
  }
}
