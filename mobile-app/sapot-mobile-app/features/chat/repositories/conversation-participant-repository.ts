import { Collection, Database, Q } from "@nozbe/watermelondb";

import { Conversation, ConversationType } from "@/features/shared/database/model/Conversation";
import { ConversationParticipant } from "@/features/shared/database/model/ConversationParticipant";
import { GuestUser } from "@/features/shared/database/model/guest-user";
import { Peer } from "@/features/shared/database/model/Peer";
import { chatLog } from "@/features/shared/utils/logger";
import { toAppError, captureAppError } from "@/features/shared/errors";
import { conversationParticipantId } from "@/features/chat/utils/conversation-participant-id";

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
            participant._raw.id = conversationParticipantId(
              newParticipant.conversation.id,
              newParticipant.user.id
            );
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
      const appErr = toAppError(error, "database");
      chatLog.error("chat › participant save failed", {
        conversationId: newParticipant.conversation.id,
        isInTransaction,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
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
      const appErr = toAppError(error, "database");
      chatLog.error("chat › participants bulk save failed", {
        participantCount: users.length,
        isInTransaction,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Checks if a self-conversation exists for the given user id.
   * A self-conversation has two participant records both pointing to the same user.
   * @param userId The user's own id
   * @returns Promise<string | undefined> The self-conversation id or undefined
   */
  async isSelfConversationExists(userId: string): Promise<string | undefined> {
    try {
      const participants = await this.conversationParticipantsCollection
        .query(Q.where("user", userId))
        .fetch();

      const chatIdCount: Record<string, number> = {};
      for (const participant of participants) {
        chatIdCount[participant.conversation.id] =
          (chatIdCount[participant.conversation.id] || 0) + 1;
      }

      return (
        Object.entries(chatIdCount).find(([, count]) => count >= 2)?.[0] ??
        undefined
      );
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › self conversation check failed", {
        userId,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Checks if a direct conversation exists between the given user ids.
   * @param userIds Array of user ids
   * @returns Promise<string | undefined> The direct conversation id or undefined
   */
  async isDirectConversationExists(
    userIds: string[],
    type: ConversationType = ConversationType.DIRECT
  ) {
    try {
      // Find live participant rows whose user is one of the given ids.
      // Filter is_deleted so a soft-deleted participant cannot resurrect or
      // mask a duplicate conversation.
      const participants = await this.conversationParticipantsCollection
        .query(
          Q.where("user", Q.oneOf(userIds)),
          Q.where("is_deleted", false)
        )
        .fetch();

      const chatIdCount: Record<string, number> = {};
      for (const participant of participants) {
        chatIdCount[participant.conversation.id] =
          (chatIdCount[participant.conversation.id] || 0) + 1;
      }

      const candidateIds = Object.entries(chatIdCount)
        .filter(([, count]) => count === userIds.length)
        .map(([id]) => id);

      if (candidateIds.length === 0) return undefined;

      // Verify the candidate is actually a live DIRECT conversation. This
      // rejects group conversations that happen to contain both users and
      // soft-deleted conversations.
      const conversationsCollection = this.db.get<Conversation>(
        Conversation.table
      );
      const directConversations = await conversationsCollection
        .query(
          Q.where("id", Q.oneOf(candidateIds)),
          Q.where("type", type),
          Q.where("is_deleted", false)
        )
        .fetch();

      return directConversations[0]?.id ?? undefined;
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › direct conversation check failed", {
        participantCount: userIds.length,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
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
      const appErr = toAppError(error, "database");
      chatLog.error("chat › participants list failed", appErr);
      captureAppError(appErr);
      throw appErr;
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
      const appErr = toAppError(error, "database");
      chatLog.error("chat › conversation query by peer failed", {
        peerId,
        currentUserId,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
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

      // Self-conversation: all participants are the current user
      const others = participants.filter((p) => p.user.id !== currentUserId);
      if (others.length === 0 && participants.length > 0) {
        return [participants[0]];
      }
      return others;
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › peer query by conversation failed", {
        conversationId,
        currentUserId,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
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
