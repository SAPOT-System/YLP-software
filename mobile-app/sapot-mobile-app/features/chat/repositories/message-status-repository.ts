import {
    GuestUser,
    Message,
    MessageStatus,
    MessageStatusType,
    Peer,
} from "@/features/shared";
import { chatLog } from "@/features/shared/utils/logger";
import { Collection, Database, Q } from "@nozbe/watermelondb";

chatLog.debug("[message-status-repository] module loaded");

/**
 * MessageStatusRepository manages CRUD operations for message statuses in the database.
 */
export class MessageStatusRepository {
  private messageStatusCollection: Collection<MessageStatus>;

  /**
   * Constructs a MessageStatusRepository instance.
   * @param db The WatermelonDB database instance
   */
  constructor(private db: Database) {
    this.messageStatusCollection = db.get<MessageStatus>(MessageStatus.table);
    chatLog.info("chat › message status repo constructed", {
      hasDatabase: Boolean(db),
    });
  }

  /**
   * Saves a new message status to the database.
   * @param params Object containing message, user, and status
   * @returns Promise<MessageStatus> The saved message status
   */
  async saveMessageStatus({
    message,
    user,
    status,
  }: {
    message: Message;
    user: Peer | GuestUser;
    status: MessageStatusType;
  }) {
    try {
      return await this.db.write(async () => {
        return await this.messageStatusCollection.create(
          (messageStatus: MessageStatus) => {
            messageStatus.message.set(message);
            messageStatus.user.set(user);
            messageStatus.status = status;
            messageStatus.createdAt = new Date();
            messageStatus.updatedAt = new Date();
            messageStatus.isDeleted = false;
          }
        );
      });
    } catch (error) {
      chatLog.error("chat › message status save failed", {
        messageId: message.id,
        status,
        error,
      });
      throw error;
    }
  }

  /**
   * Updates the status of a message by message id.
   * @param messageId The message id
   * @param status The new status
   * @returns Promise<void>
   */
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
          chatLog.debug("chat › message status updating", {
            messageId,
            status,
          });
          await messageStatus[0].update((messageStatus) => {
            messageStatus.status = status;
            messageStatus.updatedAt = new Date();
          });
        }
      });
    } catch (error) {
      chatLog.error("chat › message status update failed", {
        messageId,
        status,
        error,
      });
      throw error;
    }
  }

  /**
   * Updates the status of a message status record by its id.
   * @param messageStatusId The message status id
   * @param status The new status
   * @returns Promise<void>
   */
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
            messageStatus.updatedAt = new Date();
          });
        }
      });
    } catch (error) {
      chatLog.error("chat › status update by id failed", {
        messageStatusId,
        status,
        error,
      });
      throw error;
    }
  }

  /**
   * Queries the message status for a given message id.
   * @param messageId The message id
   * @returns Promise<MessageStatus | undefined> The message status or undefined
   */
  async queryMessageStatusByMessage(messageId: string) {
    try {
      return await this.db.write(async () => {
        const messageStatus = await this.messageStatusCollection.query(
          Q.where("message", messageId)
        );

        return messageStatus[0];
      });
    } catch (error) {
      chatLog.error("chat › status query by message failed", {
        messageId,
        error,
      });
      throw error;
    }
  }

  /**
   * Queries message statuses for messages that are not sent or sent.
   * @param messageIds Array of message ids
   * @returns Promise<MessageStatus[]> Array of message statuses
   */
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
      chatLog.error("chat › not sent status query failed", {
        messageCount: messageIds.length,
        error,
      });
      throw error;
    }
  }

  /**
   * Queries all message statuses in the database.
   * @returns Promise<MessageStatus[]> Array of all message statuses
   */
  async queryAllStatuses() {
    try {
      return await this.messageStatusCollection.query().fetch();
    } catch (error) {
      chatLog.error("chat › status list failed", { error });
      throw error;
    }
  }

  /**
   * Gets destroy operations for all message statuses (for debugging/testing purposes).
   * @returns Promise<any[]> Array of destroy operations
   */
  async getStatusDestroyOps() {
    chatLog.debug("chat › status destroy ops requested");
    const records = await this.messageStatusCollection.query().fetch();

    return records.map((r) => r.prepareDestroyPermanently());
  }
}
