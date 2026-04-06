import { Call, CallStatus, CallType, Conversation, GuestUser, Peer } from "@/features/shared";
import { Collection, Database, Q } from "@nozbe/watermelondb";

export class CallRepository {
  private callsCollection: Collection<Call>;

  constructor(private db: Database) {
    this.callsCollection = db.get<Call>(Call.table);
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
  }

  async queryByConversation(conversationId: string) {
    return await this.callsCollection
      .query(Q.where("conversation", conversationId))
      .fetch();
  }

  async queryAllCalls() {
    return await this.callsCollection.query().fetch();
  }

  async getCallDestroyOps() {
    const records = await this.callsCollection.query().fetch();
    return records.map((r) => r.prepareDestroyPermanently());
  }
}
