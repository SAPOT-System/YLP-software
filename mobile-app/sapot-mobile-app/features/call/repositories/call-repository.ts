import { Call, CallStatus, CallType, Conversation, GuestUser, Peer } from "@/features/shared";
import { Collection, Database, Q } from "@nozbe/watermelondb";
import baseLogger from "@/features/shared/utils/logger";

const callLog = baseLogger.extend("call");
callLog.debug("[call-repository] module loaded");

export class CallRepository {
  private callsCollection: Collection<Call>;

  constructor(private db: Database) {
    this.callsCollection = db.get<Call>(Call.table);
    callLog.info("call › repository constructed", { hasDatabase: Boolean(db) });
  }

  async saveCall(
    newCall: {
      conversation: Conversation;
      initiator: Peer | GuestUser;
      callType: CallType;
      status: CallStatus;
      startTime?: Date;
      endTime?: Date;
      updatedAt?: Date;
      createdAt?: Date;
      isDeleted?: boolean;
      id?: string;
    },
    isInTransaction = false
  ) {
    try {
      const action = async () => {
        return await this.callsCollection.create((call) => {
          if (newCall.id) {
            call._raw.id = newCall.id;
          }
          call.conversation.set(newCall.conversation);
          call.initiator.set(newCall.initiator);
          call.callType = newCall.callType;
          call.status = newCall.status;
          call.startTime = newCall.startTime ?? new Date();
          if (newCall.endTime) {
            call.endTime = newCall.endTime;
          }
          call.updatedAt = newCall.updatedAt ?? new Date();
          call.createdAt = newCall.createdAt ?? new Date();
          call.isDeleted = newCall.isDeleted ?? false;
        });
      };

      if (isInTransaction) {
        return action();
      }

      return this.db.write(action);
    } catch (error) {
      callLog.error("call › save failed", {
        conversationId: newCall.conversation.id,
        callType: newCall.callType,
        status: newCall.status,
        isInTransaction,
        error,
      });
      throw error;
    }
  }

  async queryByConversation(conversationId: string) {
    try {
      return await this.callsCollection
        .query(Q.where("conversation", conversationId))
        .fetch();
    } catch (error) {
      callLog.error("call › query by conversation failed", {
        conversationId,
        error,
      });
      throw error;
    }
  }

  async queryAllCalls() {
    try {
      return await this.callsCollection.query().fetch();
    } catch (error) {
      callLog.error("call › list failed", { error });
      throw error;
    }
  }

  async getCallDestroyOps() {
    callLog.debug("call › destroy ops requested");
    const records = await this.callsCollection.query().fetch();
    return records.map((r) => r.prepareDestroyPermanently());
  }
}
