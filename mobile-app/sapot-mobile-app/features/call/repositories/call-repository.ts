import { Call, CallStatus, CallType, Conversation, GuestUser, Peer } from "@/features/shared";
import { callLog } from "@/features/shared/utils/logger";
import { toAppError, captureAppError } from "@/features/shared/errors";
import { Collection, Database, Q } from "@nozbe/watermelondb";
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
      const appErr = toAppError(error, "database");
      callLog.error("call › save failed", {
        conversationId: newCall.conversation.id,
        callType: newCall.callType,
        status: newCall.status,
        isInTransaction,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  async queryCallById(callId: string): Promise<Call | null> {
    try {
      const calls = await this.callsCollection.query(Q.where("id", callId)).fetch();
      return calls[0] ?? null;
    } catch (error) {
      const appErr = toAppError(error, "database");
      callLog.error("call › query by id failed", { callId, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  async queryByConversation(conversationId: string) {
    try {
      return await this.callsCollection
        .query(Q.where("conversation", conversationId))
        .fetch();
    } catch (error) {
      const appErr = toAppError(error, "database");
      callLog.error("call › query by conversation failed", {
        conversationId,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  async queryAllCalls() {
    try {
      return await this.callsCollection.query().fetch();
    } catch (error) {
      const appErr = toAppError(error, "database");
      callLog.error("call › list failed", appErr);
      captureAppError(appErr);
      throw appErr;
    }
  }

  async updateCallStatus(callId: string, status: CallStatus, endTime?: Date) {
    try {
      return await this.db.write(async () => {
        const calls = await this.callsCollection.query(Q.where("id", callId)).fetch();

        if (calls.length <= 0) {
          callLog.warn("call › update skipped (not found)", { callId, status });
          return;
        }

        await calls[0].update((call) => {
          call.status = status;
          if (endTime) {
            call.endTime = endTime;
          }
          call.updatedAt = new Date();
        });
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      callLog.error("call › update status failed", {
        callId,
        status,
        hasEndTime: Boolean(endTime),
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  async getCallDestroyOps() {
    callLog.debug("call › destroy ops requested");
    const records = await this.callsCollection.query().fetch();
    return records.map((r) => r.prepareDestroyPermanently());
  }
}
