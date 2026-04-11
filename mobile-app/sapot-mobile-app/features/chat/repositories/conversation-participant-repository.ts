import { Collection, Database, Q } from "@nozbe/watermelondb";

import {
    Conversation,
    ConversationParticipant,
    GuestUser,
    Peer,
} from "@/features/shared";
import { chatLog } from "@/features/shared/utils/logger";

chatLog.debug("[conversation-participant-repository] module loaded");

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
    chatLog.info("chat › participant repo constructed", {
      hasDatabase: Boolean(db),
    });
  }

  /**
   * Saves a new conversation participant to the database.
    * @param newParticipant The participant data (conversation, user)
   * @param isInTransaction Whether to run in an existing transaction
   * @returns Promise<ConversationParticipant> The saved participant
   */
  async saveConversationParticipant(
    newParticipant: {
      conversation: Conversation;
      user: Peer | GuestUser;
    },
    isInTransaction = false
  ) {
    try {
      const action = async () => {
        return await this.conversationParticipantsCollection.create(
          (participant) => {
            participant.conversation.set(newParticipant.conversation);
            participant.user.set(newParticipant.user);
            participant.joinedAt = new Date();
            participant.isDeleted = false;
            participant.createdAt = new Date();
            participant.updatedAt = new Date();
          }
        );
      };

      if (isInTransaction) {
        return action();
      } else {
        return this.conversationParticipantsCollection.database.write(action);
      }
    } catch (error) {
      chatLog.error("chat › participant save failed", {
        conversationId: newParticipant.conversation.id,
        isInTransaction,
        error,
      });
      throw error;
    }
  }

  /**
   * Saves multiple conversation participants to the database.
   * @param users Array of users (peers)
   * @param conversation The conversation
   * @param isInTransaction Whether to run in an existing transaction
   * @returns Promise<void>
   */
  async saveMultipleConversationParticipant(
    users: (Peer | GuestUser)[],
    conversation: Conversation,
    isInTransaction = false
  ) {
    try {
      await Promise.all(
        users.map((user) =>
          this.saveConversationParticipant(
            { conversation: conversation, user: user },
            isInTransaction
          )
        )
      );
    } catch (error) {
      chatLog.error("chat › participants bulk save failed", {
        participantCount: users.length,
        isInTransaction,
        error,
      });
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
      chatLog.error("chat › direct conversation check failed", {
        participantCount: userIds.length,
        error,
      });
      throw error;
    }
  }

  /**
   * Queries all conversation participants in the database.
   * @returns Promise<ConversationParticipant[]> Array of all participants
   */
  async queryAllParticipants() {
    try {
      return await this.conversationParticipantsCollection.query().fetch();
    } catch (error) {
      chatLog.error("chat › participants list failed", { error });
      throw error;
    }
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
      chatLog.error("chat › conversation query by peer failed", {
        peerId,
        currentUserId,
        error,
      });
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
      chatLog.debug("chat › participants query", {
        conversationId,
        currentUserId,
      });

      const participants = await this.conversationParticipantsCollection
        .query(Q.where("conversation", conversationId))
        .fetch();

      // Exclude the user
      const peer = participants.filter((p) => p.user.id !== currentUserId);

      return peer;
    } catch (error) {
      chatLog.error("chat › peer query by conversation failed", {
        conversationId,
        currentUserId,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets destroy operations for all conversation participants (for debugging/testing purposes).
   * @returns Promise<any[]> Array of destroy operations
   */
  async getParticipantDestroyOps() {
    chatLog.debug("chat › participant destroy ops requested");
    const records = await this.conversationParticipantsCollection
      .query()
      .fetch();

    return records.map((r) => r.prepareDestroyPermanently());
  }
}
