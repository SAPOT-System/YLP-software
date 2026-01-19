import { Chat, Message, MessageStatus, Peer } from "@/features/shared";
import { Collection, Database, Q } from "@nozbe/watermelondb";

export class MessageRepository {
  private messagesCollection: Collection<Message>;

  constructor(private db: Database) {
    this.messagesCollection = db.get<Message>("messages");
  }

  async saveMessage(newMessage: {
    sender: Peer;
    status: MessageStatus;
    message: string;
    chat: Chat;
  }) {
    try {
      const savedMessage = await this.db.write(async () => {
        const message = await this.messagesCollection.create(
          (message: Message) => {
            message.sender.set(newMessage.sender);
            message.chat.set(newMessage.chat);
            message.message = newMessage.message;
            message.status = newMessage.status;
            message.createdAt = new Date();
          }
        );
        return message;
      });
      return savedMessage;
    } catch (error) {
      console.error("[MessageRepository]: Error creating a message:", error);
    }
  }

  async queryMessagesByChatId(chatId: string, limit = 50, offset = 0) {
    try {
      return await this.messagesCollection.query(
        Q.where("chat_id", chatId),
        Q.sortBy("created_at", Q.desc),
        Q.skip(offset),
        Q.take(limit)
      );
    } catch (error) {
      console.error("[MessageRepository]: Error querying messages:", error);
      throw error;
    }
  }
}
