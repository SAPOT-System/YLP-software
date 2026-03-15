import { Collection, Database, Q } from "@nozbe/watermelondb";

import {
  Conversation,
  ConversationParticipant,
  ConversationParticipantRole,
  GuestUser,
  Peer,
} from "@/features/shared";

/**
 * ConversationParticipantRepository manages CRUD operations for conversation participants in the database.
 */
export class ConversationParticipantRepository {
  private conversationParticipantsCollection: Collection<ConversationParticipant>;
  /**
   * Constructs a ConversationParticipantRepository instance.
   * @param db The WatermelonDB database instance
   */
  constructor(private db: Database) {
    this.conversationParticipantsCollection =
      this.db.get<ConversationParticipant>(ConversationParticipant.table);
  }

  /**
   * Saves a new conversation participant to the database.
   * @param newParticipant The participant data (role, conversation, user)
   * @param isInTransaction Whether to run in an existing transaction
   * @returns Promise<ConversationParticipant> The saved participant
   */
  async saveConversationParticipant(
    newParticipant: {
      role: ConversationParticipantRole;
      conversation: Conversation;
      user: Peer | GuestUser;
    },
    isInTransaction = false
  ) {
    try {
      const action = async () => {
        return await this.conversationParticipantsCollection.create(
          (participant) => {
            participant.role = newParticipant.role;
            participant.conversation.set(newParticipant.conversation);
            participant.user.set(newParticipant.user);
            participant.joinedAt = new Date();
            participant.isDeleted = false; // TODO: find way to make the false as default for isDeleted columns
          }
        );
      };

      if (isInTransaction) {
        return action();
      } else {
        return this.conversationParticipantsCollection.database.write(action);
      }
    } catch (error) {
      console.error(
        `[ConversationParticipantRepository]: Error creating conversation participant:\nConversation Participant:\n${JSON.stringify(
          {
            name: newParticipant.user.username,
            role: newParticipant.role,
            isInTransaction,
          },
          null,
          2
        )}`
      );
      throw error;
    }
  }

  /**
   * Saves multiple conversation participants to the database.
   * @param users Array of users (peers)
   * @param conversation The conversation
   * @param role The participant role (default MEMBER)
   * @param isInTransaction Whether to run in an existing transaction
   * @returns Promise<void>
   */
  async saveMultipleConversationParticipant(
    users: (Peer | GuestUser)[],
    conversation: Conversation,
    role: ConversationParticipantRole = ConversationParticipantRole.MEMBER,
    isInTransaction = false
  ) {
    try {
      await Promise.all(
        users.map((user) =>
          this.saveConversationParticipant(
            { role: role, conversation: conversation, user: user },
            isInTransaction
          )
        )
      );
    } catch (error) {
      console.error(
        `[ConversationParticipantRepository]: Error creating multiple conversation participant:\nConversation Participants:\n${JSON.stringify(
          {
            names: [...users.map((user) => user.username)],
            role,
            isInTransaction,
          },
          null,
          2
        )}`
      );
      throw error;
    }
  }

  /**
   * Checks if a direct conversation exists between the given user ids.
   * @param userIds Array of user ids
   * @returns Promise<string | undefined> The direct conversation id or undefined
   */
  async isDirectConversationExists(userIds: string[]) {
    try {
      // Find all participants with userIds in the list
      const participants = await this.conversationParticipantsCollection
        .query(Q.where("user", Q.oneOf(userIds)))
        .fetch();

      // Group by conversation id and count participants per conversation
      const chatIdCount: Record<string, number> = {};
      for (const participant of participants) {
        chatIdCount[participant.conversation.id] =
          (chatIdCount[participant.conversation.id] || 0) + 1;
      }

      // Find a chatId where the count matches the peerIds length
      const directChatId =
        Object.entries(chatIdCount).find(
          ([, count]) => count === userIds.length
        )?.[0] || undefined;

      return directChatId;
    } catch (error) {
      console.error(
        `[ConversationParticipantRepository]: Error checking if there is a direct conversation between ${userIds}`
      );
      throw error;
    }
  }

  /**
   * Queries all conversation participants in the database.
   * @returns Promise<ConversationParticipant[]> Array of all participants
   */
  async queryAllParticipants() {
    return await this.conversationParticipantsCollection.query().fetch();
  }

  /**
   * Queries conversations by peer id, excluding the current user.
   * @param peerId The peer id
   * @param currentUserId The current user's id
   * @returns Promise<ConversationParticipant[]> Array of conversation participants
   */
  async queryConversationByPeer(peerId: string, currentUserId: string) {
    try {
      const participants = await this.conversationParticipantsCollection
        .query(Q.where("user", peerId))
        .fetch();

      // Exclude the user
      const conversation = participants.filter(
        (p) => p.user.id !== currentUserId
      );

      return conversation;
    } catch (error) {
      console.error(
        `[ConversationParticipantRepository]: Error querying conversation by the peer ID of ${peerId} and current user ID of ${currentUserId}`
      );
      throw error;
    }
  }

  /**
   * Queries peers by chat (conversation) id, excluding the current user.
   * @param conversationId The conversation id
   * @param currentUserId The current user's id
   * @returns Promise<ConversationParticipant[]> Array of peer participants
   */
  async queryPeerByChatId(conversationId: string, currentUserId: string) {
    try {
      console.log(this.queryAllParticipants());

      const participants = await this.conversationParticipantsCollection
        .query(Q.where("conversation", conversationId))
        .fetch();

      // Exclude the user
      const peer = participants.filter((p) => p.user.id !== currentUserId);

      return peer;
    } catch (error) {
      console.error(
        `[ConversationParticipantRepository]: Error querying peer by the conversation ID of ${conversationId} and current user ID of ${currentUserId}`
      );
      throw error;
    }
  }

  /**
   * Gets destroy operations for all conversation participants (for debugging/testing purposes).
   * @returns Promise<any[]> Array of destroy operations
   */
  async getParticipantDestroyOps() {
    const records = await this.conversationParticipantsCollection
      .query()
      .fetch();

    return records.map((r) => r.prepareDestroyPermanently());
  }
}
