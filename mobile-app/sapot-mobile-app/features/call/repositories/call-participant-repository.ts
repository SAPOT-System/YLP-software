import { Call, CallParticipant, GuestUser, Peer } from "@/features/shared";
import { Collection, Database, Q } from "@nozbe/watermelondb";

export class CallParticipantRepository {
  private callParticipantsCollection: Collection<CallParticipant>;

  constructor(private db: Database) {
    this.callParticipantsCollection = db.get<CallParticipant>(
      CallParticipant.table
    );
  }

  async saveCallParticipant(
    newParticipant: {
      call: Call;
      user: Peer | GuestUser;
      joinedAt?: Date;
      leftAt?: Date;
      createdAt?: Date;
      updatedAt?: Date;
      isDeleted?: boolean;
    },
    isInTransaction = false
  ) {
    const action = async () => {
      return await this.callParticipantsCollection.create((participant) => {
        participant.call.set(newParticipant.call);
        participant.user.set(newParticipant.user);
        participant.joinedAt = newParticipant.joinedAt ?? new Date();
        if (newParticipant.leftAt) {
          participant.leftAt = newParticipant.leftAt;
        }
        participant.createdAt = newParticipant.createdAt ?? new Date();
        participant.updatedAt = newParticipant.updatedAt ?? new Date();
        participant.isDeleted = newParticipant.isDeleted ?? false;
      });
    };

    if (isInTransaction) {
      return action();
    }

    return this.db.write(action);
  }

  async queryByCall(callId: string) {
    return await this.callParticipantsCollection
      .query(Q.where("call", callId))
      .fetch();
  }

  async queryAllParticipants() {
    return await this.callParticipantsCollection.query().fetch();
  }

  async getCallParticipantDestroyOps() {
    const records = await this.callParticipantsCollection.query().fetch();
    return records.map((r) => r.prepareDestroyPermanently());
  }
}
