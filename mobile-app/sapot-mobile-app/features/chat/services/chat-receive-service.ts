import {
  ConnectionService,
  Conversation,
  ConversationType,
  database,
  MessageStatusType,
  MessageType,
  Peer,
  PeerService,
  UserStore,
} from "@/features/shared";
import { chatLog } from "@/features/shared/core/utils/logger";
import { ConversationKeyManager } from "@/features/chat/services/conversation-key-manager";
import * as Notifications from "expo-notifications";
import {
  ConversationParticipantRepository,
  ConversationRepository,
  MessageRepository,
  MessageStatusRepository,
} from "../repositories";
import { DataChatMessageI } from "../types";
import { toAppError, captureAppError } from "@/features/shared/core/errors";
import { MessageAckTracker } from "./message-ack-tracker";

type ChatSyncService = {
  syncNow(): Promise<void>;
};

/**
 * ChatReceiveService handles all incoming message flows: receiving chat messages,
 * saving them, sending acknowledgments, and updating read/delivery statuses.
 * It is constructed by ChatService and shares the same MessageAckTracker instance.
 */
export class ChatReceiveService {
  constructor(
    private readonly peerService: PeerService,
    private readonly messageRepository: MessageRepository,
    private readonly messageStatusRepository: MessageStatusRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly conversationParticipantRepository: ConversationParticipantRepository,
    private readonly connectionService: ConnectionService,
    private readonly userStore: UserStore,
    private readonly syncService: ChatSyncService,
    private readonly conversationKeyManager: ConversationKeyManager,
    private readonly ackTracker: MessageAckTracker,
  ) {}

  /**
   * Creates a chat room (conversation) with the given peer, and adds both users as participants.
   * Also used by ChatService.ensureConversationInitialized for outgoing message flows.
   */
  async createChatRoom(
    peer: Peer,
    conversationId?: string,
    messageType: MessageType = MessageType.TEXT
  ): Promise<Conversation> {
    // Wrap into write method to ensure ACID for safety transaction
    try {
      chatLog.info("chat › room create", {
        peerId: peer.id,
        hasConversationId: Boolean(conversationId),
      });
      return await database.write(async () => {
        const conversationType =
          messageType === MessageType.SMS ? ConversationType.SMS : ConversationType.DIRECT;
        const conversation = await this.conversationRepository.saveConversation(
          {
            type: conversationType,
            id: conversationId,
          },
          true
        );
        const participants =
          peer.id === this.userStore.user.id
            ? [peer]
            : [peer, this.userStore.user];
        await this.conversationParticipantRepository.saveMultipleConversationParticipant(
          participants,
          conversation,
          true
        );
        return conversation;
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › create room failed", {
        peerId: peer.id,
        conversationId,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Handles an incoming chat message: finds/creates sender and conversation, saves the message, and sends an acknowledgment.
   * @param data Incoming chat message data
   * @returns Promise<void>
   */
  async handleIncomingChatMessage(data: DataChatMessageI): Promise<void> {
    try {
      chatLog.debug("chat › incoming message", {
        conversationId: data.conversationId,
        messageId: data.messageId,
        senderId: data.from,
      });
      let sender = await this.peerService.findPeerById(data.from);
      if (!sender) {
        chatLog.info("chat › sender not found, creating peer", {
          senderId: data.from,
          username: data.senderProfile.username,
        });
        sender = await this.peerService.createUser(
          data.from,
          data.senderProfile.username,
          data.senderProfile.firstName,
          data.senderProfile.lastName
        );
      }
      const existingMessage = await this.messageRepository.queryMessageById(
        data.messageId
      );
      if (existingMessage) {
        chatLog.info("chat › incoming message deduped", {
          messageId: data.messageId,
          conversationId: data.conversationId,
        });
        this.acknowledgeIncomingMessage(sender.id, data.messageId);
        return;
      }
      const conversation = await this.getOrCreateConversationForIncoming(
        sender,
        data.conversationId,
        data.messageType
      );
      await this.conversationKeyManager.deriveAndSetConversationKey(sender.id, conversation.id);
      await this.saveIncomingMessage(sender, conversation, data);
      void this.conversationRepository.touchConversation(conversation.id);
      this.acknowledgeIncomingMessage(sender.id, data.messageId);
      const senderName =
        `${sender.firstName} ${sender.lastName ?? ""}`.trim() ||
        sender.username;
      void this.showChatNotification(
        senderName,
        data.message,
        conversation.id,
        sender.id
      );
    } catch (error) {
      const appErr = toAppError(error, "network");
      chatLog.error("chat › incoming message failed", {
        conversationId: data.conversationId,
        messageId: data.messageId,
        senderId: data.from,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  private async showChatNotification(
    senderName: string,
    messageContent: string,
    conversationId: string,
    senderId: string
  ): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: senderName,
          body:
            messageContent.length > 100
              ? messageContent.slice(0, 97) + "..."
              : messageContent,
          data: {
            type: "incoming_message",
            conversation_id: conversationId,
            sender_id: senderId,
            sender_name: senderName,
            message_preview: messageContent.slice(0, 100),
          },
        },
        trigger: { channelId: "chat-messages" },
      });
    } catch (error) {
      const appErr = toAppError(error, "network");
      chatLog.error("chat › show notification failed", appErr);
    }
  }

  /**
   * Gets or creates a conversation for an incoming message, ensuring the conversation exists in the repository.
   * @param sender The sender peer
   * @param conversationId The conversation id
   * @returns Promise<Conversation>
   */
  private async getOrCreateConversationForIncoming(
    sender: Peer,
    conversationId: string,
    messageType: MessageType = MessageType.TEXT
  ): Promise<Conversation> {
    const isConversationExist =
      await this.conversationRepository.isConversationExist(conversationId);
    chatLog.debug("chat › conversation exists", {
      conversationId,
      exists: isConversationExist,
    });
    if (!isConversationExist) {
      const isSms = messageType === MessageType.SMS;
      const existingConversationId =
        await this.conversationParticipantRepository.isDirectConversationExists(
          [sender.id, this.userStore.user.id],
          isSms ? ConversationType.SMS : ConversationType.DIRECT
        );
      if (existingConversationId) {
        chatLog.debug("chat › reusing existing conversation", {
          conversationId: existingConversationId,
          type: isSms ? "sms" : "direct",
          senderId: sender.id,
        });
        return await this.conversationRepository.queryConversationById(
          existingConversationId
        );
      }
      return await this.createChatRoom(sender, conversationId, messageType);
    } else {
      return await this.conversationRepository.queryConversationById(
        conversationId
      );
    }
  }

  /**
   * Saves an incoming message to the repository.
   * @param sender The sender peer
   * @param conversation The conversation
   * @param data Incoming chat message data
   * @returns Promise<void>
   */
  private async saveIncomingMessage(
    sender: Peer,
    conversation: Conversation,
    data: DataChatMessageI
  ): Promise<void> {
    const preparedMessage = this.messageRepository.prepareMessageCreate({
      sender: sender,
      content: data.message,
      conversation: conversation,
      messageId: data.messageId,
      // Incoming messages may arrive before the conversation key is derived
      // (e.g. first contact with a guest peer). Persist as plaintext rather than
      // discarding; the onKeySet observer re-derives the key for subsequent reads.
      allowPlaintext: true,
      messageType: data.messageType,
      linkedMessageId: data.linkedMessageId,
      sentAt: data.sentAt,
    });
    const preparedStatus =
      this.messageStatusRepository.prepareMessageStatusCreate({
        message: preparedMessage,
        user: this.userStore.user,
        status: MessageStatusType.DELIVERED,
      });
    await database.write(async () => {
      await database.batch(preparedMessage, preparedStatus);
    });
    chatLog.debug("chat › incoming saved", {
      conversationId: conversation.id,
      messageId: data.messageId,
      senderId: sender.id,
    });
  }

  /**
   * Sends an acknowledgment for an incoming message to the sender.
   * @param senderId The sender's peer id
   * @param messageId The message id to acknowledge
   */
  acknowledgeIncomingMessage(senderId: string, messageId: string): void {
    this.connectionService.sendAckMessage(senderId, {
      messageId,
      to: senderId,
      from: this.userStore.user.id,
    });
  }

  /**
   * Handles an incoming seen message from the receiver, updating all DELIVERED/SENT messages
   * in the conversation (sent by the current user) to READ.
   * @param conversationId The conversation id that was seen
   * @returns Promise<void>
   */
  async handleSeenMessage(conversationId: string): Promise<void> {
    try {
      chatLog.debug("chat › seen received", { conversationId });
      const ourMessages =
        await this.messageRepository.queryMessagesByConversationAndSender(
          conversationId,
          this.userStore.user.id
        );
      const messageIds = ourMessages.map((m) => m.id);
      await this.messageStatusRepository.updateDeliveredMessagesToRead(
        messageIds
      );
      chatLog.debug("chat › seen handled", {
        conversationId,
        updatedCount: messageIds.length,
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › seen handling failed", { conversationId, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Sends a seen notification to the current peer for the active conversation.
   * Called by the receiver when they open/view a conversation.
   * @param conversationId The conversation id to mark as read
   * @param peer The current peer (from ChatService state)
   */
  async markConversationAsRead(conversationId: string, peer: Peer | undefined): Promise<void> {
    if (!peer) return;
    try {
      chatLog.debug("chat › mark as read", {
        conversationId,
        peerId: peer.id,
      });
      const conversation =
        await this.conversationRepository.queryConversationById(conversationId);
      if (conversation?.type !== ConversationType.SMS) {
        this.connectionService.sendSeenMessage(peer.id, conversationId);
      }
      const peerMessages =
        await this.messageRepository.queryMessagesByConversationAndSender(
          conversationId,
          peer.id
        );
      const messageIds = peerMessages.map((m) => m.id);
      await this.messageStatusRepository.updateDeliveredMessagesToRead(
        messageIds
      );
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.warn("chat › mark as read failed", { conversationId, ...appErr });
    }
  }

  /**
   * Handles an incoming acknowledgment message for a given messageId, updating its status to SENT.
   * @param messageId The message id to acknowledge
   * @returns Promise<void>
   */
  async handleServerAck(messageId: string): Promise<void> {
    try {
      chatLog.debug("chat › server ack received", { messageId });
      this.ackTracker.clear(messageId);
      await this.messageStatusRepository.updateMessageStatusByMessage(
        messageId,
        MessageStatusType.SENT
      );
      chatLog.debug("chat › status set to SENT via server ack", { messageId });
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › server ack handling failed", { messageId, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  async handleAckMessage(messageId: string): Promise<void> {
    try {
      chatLog.debug("chat › ack received", { messageId });
      this.ackTracker.clear(messageId);

      await this.messageStatusRepository.updateMessageStatusByMessage(
        messageId,
        MessageStatusType.DELIVERED
      );
      if (!this.userStore.isGuest) void this.syncService.syncNow();
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › ack handling failed", { messageId, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }
}
