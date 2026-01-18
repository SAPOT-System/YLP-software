import { Message, Status } from "@/features/shared";
import { Collection, Database, Q } from "@nozbe/watermelondb";

export class MessageRepository {
  private messagesCollection: Collection<Message>;

  constructor(private db: Database) {
    this.messagesCollection = db.get<Message>("messages");
  }

  async saveMessage(newMessage: {
    senderId: string;
    status: Status;
    message: string;
    chatId: string;
  }) {
    try {
      const savedMessage = await this.db.write(async () => {
        const message = await this.messagesCollection.create(
          (message: Message) => {
            message.senderId = newMessage.senderId;
            message.message = newMessage.message;
            message.status = newMessage.status;
            message.chatId = newMessage.chatId;
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
      // const allMessages = await this.messagesCollection.query().fetch();
      // return allMessages;
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
