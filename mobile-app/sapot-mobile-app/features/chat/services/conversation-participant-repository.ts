import { Chat, Participant, ParticipantRole, Peer } from "@/features/shared";
import { Collection, Database, Q } from "@nozbe/watermelondb";

export class ConversationParticipantRepository {
  private participantsCollection: Collection<Participant>;
  constructor(private db: Database) {
    this.participantsCollection = this.db.get<Participant>("participants");
  }

  async add(
    newParticipant: {
      role: ParticipantRole;
      chat: Chat;
      peer: Peer;
    },
    isInTransaction = false
  ) {
    try {
      const action = async () => {
        return await this.participantsCollection.create((participant) => {
          participant.role = newParticipant.role;
          participant.chat.set(newParticipant.chat);
          participant.peer.set(newParticipant.peer);
          participant.joinedAt = new Date();
          participant.createdAt = new Date();
        });
      };

      if (isInTransaction) {
        return action();
      } else {
        return this.participantsCollection.database.write(action);
      }
    } catch (error) {
      console.error(
        "[ConversationParticipantRepository]: Error creating chat participant:",
        error
      );
      throw error;
    }
  }

  async addMultiple(
    peers: Peer[],
    chat: Chat,
    role: ParticipantRole = ParticipantRole.MEMBER,
    isInTransaction = false
  ) {
    try {
      await Promise.all(
        peers.map((peer) =>
          this.add({ role: role, chat: chat, peer: peer }, isInTransaction)
        )
      );
    } catch (error) {
      console.error(
        "[ConversationParticipantRepository]: Error creating multiple chat participant:",
        error
      );
      throw error;
    }
  }

  async isDirectChatExists(peerIds: string[]) {
    try {
      // Find all participants with peerIds in the list
      const participants = await this.participantsCollection
        .query(Q.where("peer", Q.oneOf(peerIds)))
        .fetch();

      // Group by chat id and count participants per chat
      const chatIdCount: Record<string, number> = {};
      for (const participant of participants) {
        chatIdCount[participant.chat.id] =
          (chatIdCount[participant.chat.id] || 0) + 1;
      }

      // Find a chatId where the count matches the peerIds length
      const directChatId =
        Object.entries(chatIdCount).find(
          ([, count]) => count === peerIds.length
        )?.[0] || undefined;

      return directChatId;
    } catch (error) {
      console.error(
        "[ConversationParticipantRepository]: Error finding if chat exist between peers:"
      );
      error;
      throw error;
    }
  }

  async getAllParticipants() {
    return await this.participantsCollection.query().fetch();
  }

  async getPeerByChatId(chatId: string, currentUserId: string) {
    try {
      console.log(this.getAllParticipants());

      const participants = await this.participantsCollection
        .query(Q.where("chat", chatId))
        .fetch();

      // Exclude the user
      const peer = participants.filter((p) => p.peer.id !== currentUserId);

      return peer;
    } catch (error) {
      console.error(
        "[ConversationParticipantRepository]: Error finding peer by chat id:",
        error
      );
      throw error;
    }
  }
}
