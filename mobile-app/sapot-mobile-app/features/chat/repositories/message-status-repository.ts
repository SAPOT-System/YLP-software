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

  async updateMessageStatusByMessage(
    messageId: string,
    status: MessageStatusType
  ) {
    try {
      return await this.db.write(async () => {
        const messageStatus = await this.messageStatusCollection.query(
          Q.where("message", messageId)
        );

        if (messageStatus.length > 0) {
          console.log("[MessageStatusRepository]: updating message status...");
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

  async updateMessageStatusById(
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

  // This will query the message with the status of sent and not_sent
  async queryNotSentByMessages(messageIds: string[]) {
    try {
      return await this.db.write(async () => {
        const messageStatus = await this.messageStatusCollection.query(
          Q.where(
            "status",
            Q.oneOf([MessageStatusType.NOT_SENT, MessageStatusType.SENT])
          ),
          Q.where("message", Q.oneOf(messageIds))
        );

        return messageStatus;
      });
    } catch (error) {
      console.error(
        "[MessageStatusRepository]: Error updateing message status:",
        error
      );
      throw error;
    }
  }

  async queryAllStatuses() {
    return await this.messageStatusCollection.query().fetch();
  }

  // For debugging purposes
  async getStatusDestroyOps() {
    const records = await this.messageStatusCollection.query().fetch();

    return records.map((r) => r.prepareDestroyPermanently());
  }
}
