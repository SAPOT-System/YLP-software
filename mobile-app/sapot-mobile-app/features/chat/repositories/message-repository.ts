import { Collection, Database, Q } from "@nozbe/watermelondb";
import { Conversation, Message, MessageType, Peer } from "@/features/shared";

export class MessageRepository {
  private messagesCollection: Collection<Message>;

  constructor(private db: Database) {
    this.messagesCollection = db.get<Message>(Message.table);
  }

  // TODO: make the content type flexible for other type of messages
  // TODO: make the parameter as destrcutured
  async saveMessage(newMessage: {
    sender: Peer;
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
          }
        );
        return message;
      });
      return savedMessage;
    } catch (error) {
      console.error(
        `[MessageRepository]: Error saving a message\n${JSON.stringify(
          {
            senderName: newMessage.sender.username,
            content: newMessage.content,
            conversationId: newMessage.conversation.id,
            messageId: newMessage.messageId,
          },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

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
      console.error(
        `[MessageRepository]: Error querying messgae by conversation\n${JSON.stringify(
          { conversationId, limit, offset },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  async queryAllMessages() {
    try {
      return await this.messagesCollection.query().fetch();
    } catch (error) {
      console.error("[MessageRepository]: Error querying messages:", error);
      throw error;
    }
  }

  // For debugging purposes
  async getAllMessageDestroyOps() {
    try {
      const records = await this.messagesCollection.query().fetch();

      return records.map((r) => r.prepareDestroyPermanently());
    } catch (error) {
      throw error;
    }
  }
}
