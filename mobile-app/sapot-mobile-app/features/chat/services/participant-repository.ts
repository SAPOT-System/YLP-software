import { Participant, ParticipantRole } from "@/features/shared";
import { Collection, Database, Q } from "@nozbe/watermelondb";

export class ParticipantRepository {
  private participantsCollection: Collection<Participant>;
  constructor(private db: Database) {
    this.participantsCollection = this.db.get<Participant>("participants");
  }

  async add(newParticipant: {
    role: ParticipantRole;
    chatId: string;
    peerId: string;
  }) {
    try {
      return await this.participantsCollection.create((participant) => {
        participant.role = newParticipant.role;
        participant.chatId = newParticipant.chatId;
        participant.peerId = newParticipant.peerId;
        participant.joinedAt = new Date();
        participant.createdAt = new Date();
      });
    } catch (error) {
      console.error(
        "[ParticipantRepository]: Error creating chat participant:",
        error
      );
      throw error;
    }
  }

  async addMultiple(
    peerIds: string[],
    chatId: string,
    role: ParticipantRole = ParticipantRole.MEMBER
  ) {
    try {
      await Promise.all(
        peerIds.map((id) =>
          this.add({ role: role, chatId: chatId, peerId: id })
        )
      );
    } catch (error) {
      console.error(
        "[ParticipantRepository]: Error creating multiple chat participant:",
        error
      );
      throw error;
    }
  }

  async isDirectChatExists(peerIds: string[]) {
    try {
      // Find all participants with peerIds in the list
      const participants = await this.participantsCollection
        .query(Q.where("peerId", Q.oneOf(peerIds)))
        .fetch();

      // Group by chatId and count participants per chat
      const chatIdCount: Record<string, number> = {};
      for (const participant of participants) {
        chatIdCount[participant.chatId] =
          (chatIdCount[participant.chatId] || 0) + 1;
      }

      // Find a chatId where the count matches the peerIds length
      const directChatId =
        Object.entries(chatIdCount).find(
          ([, count]) => count === peerIds.length
        )?.[0] || undefined;

      return directChatId;
    } catch (error) {
      console.error(
        "[ParticipantRepository]: Error finding if chat exist between peers:",
        error
      );
      throw error;
    }
  }
}
