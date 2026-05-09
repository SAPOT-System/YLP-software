import { Call, CallParticipant, GuestUser, Peer } from "@/features/shared";
import { callLog } from "@/features/shared/utils/logger";
import { callParticipantId } from "@/features/call/utils/call-participant-id";
import { Collection, Database, Q } from "@nozbe/watermelondb";
callLog.debug("[call-participant-repository] module loaded");

export class CallParticipantRepository {
  private callParticipantsCollection: Collection<CallParticipant>;

  constructor(private db: Database) {
    this.callParticipantsCollection = db.get<CallParticipant>(
      CallParticipant.table
    );
    callLog.info("call › participant repo constructed", { hasDatabase: Boolean(db) });
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
    try {
      const action = async () => {
        return await this.callParticipantsCollection.create((participant) => {
          participant._raw.id = callParticipantId(
            newParticipant.call.id,
            newParticipant.user.id
          );
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
    } catch (error) {
      callLog.error("call › participant save failed", {
        callId: newParticipant.call.id,
        isInTransaction,
        error,
      });
      throw error;
    }
  }

  async queryByCall(callId: string) {
    try {
      return await this.callParticipantsCollection
        .query(Q.where("call", callId))
        .fetch();
    } catch (error) {
      callLog.error("call › participants query failed", { callId, error });
      throw error;
    }
  }

  async queryAllParticipants() {
    try {
      return await this.callParticipantsCollection.query().fetch();
    } catch (error) {
      callLog.error("call › participants list failed", { error });
      throw error;
    }
  }

  async updateParticipantLeftAtByCallAndUser(
    callId: string,
    userId: string,
    leftAt: Date
  ) {
    try {
      return await this.db.write(async () => {
        const participants = await this.callParticipantsCollection
          .query(Q.where("call", callId), Q.where("user", userId))
          .fetch();

        if (participants.length <= 0) {
          callLog.warn("call › participant leftAt update skipped (not found)", {
            callId,
            userId,
          });
          return;
        }

        await participants[0].update((participant) => {
          participant.leftAt = leftAt;
          participant.updatedAt = new Date();
        });
      });
    } catch (error) {
      callLog.error("call › participant leftAt update failed", {
        callId,
        userId,
        error,
      });
      throw error;
    }
  }

  async getCallParticipantDestroyOps() {
    callLog.debug("call › participant destroy ops requested");
    const records = await this.callParticipantsCollection.query().fetch();
    return records.map((r) => r.prepareDestroyPermanently());
  }
}
