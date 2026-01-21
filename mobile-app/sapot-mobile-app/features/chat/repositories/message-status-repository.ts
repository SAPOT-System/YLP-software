import {
  Message,
  MessageStatus,
  MessageStatusType,
  Peer,
} from "@/features/shared";
import { Collection, Database, Q } from "@nozbe/watermelondb";

export class MessageStatusRepository {
  private messageStatusCollection: Collection<MessageStatus>;

  constructor(private db: Database) {
    this.messageStatusCollection = db.get<MessageStatus>(MessageStatus.table);
  }

  async saveMessageStatus({
    message,
    user,
    status,
  }: {
    message: Message;
    user: Peer;
    status: MessageStatusType;
  }) {
    try {
      return await this.db.write(async () => {
        return await this.messageStatusCollection.create(
          (messageStatus: MessageStatus) => {
            messageStatus.message.set(message);
            messageStatus.user.set(user);
            messageStatus.status = status;
          }
        );
      });
    } catch (error) {
      console.error(
        "[MessageStatusRepository]: Error creating a status:",
        error
      );
      throw error;
    }
  }

  async updateMessageStatus(
    messageStatusId: string,
    status: MessageStatusType
  ) {
    try {
      return await this.db.write(async () => {
        const messageStatus = await this.messageStatusCollection.query(
          Q.where("id", messageStatusId)
        );

        if (messageStatus.length > 0) {
          await messageStatus[0].update((messageStatus) => {
            messageStatus.status = status;
          });
        }
      });
    } catch (error) {
      console.error(
        "[MessageStatusRepository]: Error updateing message status:",
        error
      );
      throw error;
    }
  }

  async queryMessageStatusByMessage(messageId: string) {
    try {
      return await this.db.write(async () => {
        const messageStatus = await this.messageStatusCollection.query(
          Q.where("message", messageId)
        );

        return messageStatus[0];
      });
    } catch (error) {
      console.error(
        "[MessageStatusRepository]: Error updateing message status:",
        error
      );
      throw error;
    }
  }
}
