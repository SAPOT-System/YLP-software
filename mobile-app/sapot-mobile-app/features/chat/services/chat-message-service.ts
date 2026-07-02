import {
  ConnectionService,
  Conversation,
  ConversationType,
  database,
  GuestUser,
  Message,
  MessageStatus,
  MessageStatusType,
  MessageType,
  Peer,
  UserStore,
} from "@/features/shared";
import { chatLog } from "@/features/shared/core/utils/logger";
import { ConversationKeyManager } from "@/features/chat/services/conversation-key-manager";
import { ECDH_PREFIX } from "../repositories/message-repository";
import {
  ConversationParticipantRepository,
  ConversationRepository,
  MessageRepository,
  MessageStatusRepository,
} from "../repositories";
import { toAppError, captureAppError } from "@/features/shared/core/errors";
import { MessageAckTracker } from "./message-ack-tracker";

type ChatSyncService = {
  syncNow(): Promise<void>;
};

export interface ChatSessionAccessor {
  ensureConversationInitialized(): Promise<Conversation>;
  getActivePeer(): Peer | undefined;
  getOrCreateSmsConversationByPeer(peerId: string): Promise<Conversation>;
}

export class ChatMessageService {
  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly messageStatusRepository: MessageStatusRepository,
    private readonly connectionService: ConnectionService,
    private readonly conversationRepository: ConversationRepository,
    private readonly conversationParticipantRepository: ConversationParticipantRepository,
    private readonly userStore: UserStore,
    private readonly syncService: ChatSyncService,
    private readonly conversationKeyManager: ConversationKeyManager,
    private readonly ackTracker: MessageAckTracker,
    private readonly session: ChatSessionAccessor,
  ) {}

  /**
   * Sends a chat message to the current peer, ensuring conversation state and updating message status.
   * If the peer is unreachable, the message is persisted as NOT_SENT and retried when the peer reconnects.
   * @param message The message content
   * @returns Promise<{ conversationId: string; messageId: string }>
   */
  async sendChatMessage(
    message: string,
    messageType?: MessageType
  ): Promise<{ conversationId: string; messageId: string }> {
    const peer = this.session.getActivePeer();
    if (!peer) throw new Error("No peer state stored");

    let newMessage: Message | undefined;
    let newMessageStatus: MessageStatus | undefined;
    let conversation: Conversation | undefined;

    try {
      chatLog.debug("chat › send chat start", {
        peerId: peer.id,
        messageLength: message.length,
      });
      conversation = await this.session.ensureConversationInitialized();
      await this.conversationKeyManager.deriveAndSetConversationKey(
        peer.id,
        conversation.id
      );
      ({ newMessage, newMessageStatus } = await this.createMessage({
        sender: this.userStore.user,
        message: message,
        conversation: conversation,
        messageType,
      }));
      void this.conversationRepository.touchConversation(conversation.id);
      const isSelfChat = peer.id === this.userStore.user.id;
      if (isSelfChat) {
        await this.messageStatusRepository.updateMessageStatusById(
          newMessageStatus.id,
          MessageStatusType.SENT
        );
        chatLog.debug("chat › send complete (self)", {
          peerId: peer.id,
          conversationId: conversation.id,
          messageId: newMessage.id,
        });
        if (!this.userStore.isGuest) void this.syncService.syncNow();
        return {
          conversationId: conversation.id,
          messageId: newMessage.id,
        };
      }
      await this.sendAndTrackMessageStatus(
        newMessage,
        newMessageStatus,
        message,
        peer,
        conversation
      );
      if (!this.userStore.isGuest) void this.syncService.syncNow();
      chatLog.debug("chat › send complete", {
        peerId: peer.id,
        conversationId: conversation.id,
        messageId: newMessage.id,
      });
      return {
        conversationId: conversation.id,
        messageId: newMessage.id,
      };
    } catch (error) {
      const appErr = toAppError(error, "network");
      chatLog.error("chat › send failed", {
        peerId: peer?.id,
        conversationId: conversation?.id,
        ...appErr,
      });
      // Message was persisted before the send attempt failed — mark NOT_SENT
      // so the existing retry path picks it up when the peer reconnects.
      if (newMessage && newMessageStatus) {
        await this.messageStatusRepository
          .updateMessageStatusById(
            newMessageStatus.id,
            MessageStatusType.NOT_SENT
          )
          .catch((error) => chatLog.warn("chat › status update failed (not_sent)", { error }));
        return {
          conversationId: conversation!.id,
          messageId: newMessage.id,
        };
      }
      captureAppError(appErr);
      throw appErr;
    }
  }

  async sendSmsChannelMessage(
    message: string
  ): Promise<{ conversationId: string; messageId: string }> {
    const peer = this.session.getActivePeer();
    if (!peer) throw new Error("No peer state stored");
    const existingDirectId =
      (await this.conversationParticipantRepository.isDirectConversationExists([
        peer.id,
        this.userStore.user.id,
      ])) ??
      (await this.conversationParticipantRepository.isDirectConversationExists(
        [peer.id, this.userStore.user.id],
        ConversationType.SMS
      ));
    const smsConversation = existingDirectId
      ? await this.conversationRepository.queryConversationById(
          existingDirectId
        )
      : await this.session.getOrCreateSmsConversationByPeer(peer.id);
    await this.conversationKeyManager.deriveAndSetConversationKey(peer.id, smsConversation.id);
    const { newMessage } = await this.createMessage({
      sender: this.userStore.user,
      message,
      conversation: smsConversation,
      messageType: MessageType.SMS,
    });
    void this.conversationRepository.touchConversation(smsConversation.id);
    if (!this.userStore.isGuest) void this.syncService.syncNow();
    return { conversationId: smsConversation.id, messageId: newMessage.id };
  }

  /**
   * Sends a message via P2P and SMS simultaneously. Both message records are written in a
   * single atomic database batch so `linked_message_id` is set from the start — no post-hoc
   * patch needed, and the UI never shows two separate bubbles.
   */
  async sendChatMessageWithSms(message: string): Promise<{
    conversationId: string;
    p2pMessageId: string;
    smsMessageId: string;
  }> {
    const peer = this.session.getActivePeer();
    if (!peer) throw new Error("No peer state stored");

    let preparedP2pMessage: Message | undefined;
    let preparedP2pStatus: MessageStatus | undefined;
    let conversation: Conversation | undefined;

    try {
      chatLog.debug("chat › send+sms start", {
        peerId: peer.id,
        messageLength: message.length,
      });
      conversation = await this.session.ensureConversationInitialized();

      const existingDirectId =
        await this.conversationParticipantRepository.isDirectConversationExists(
          [peer.id, this.userStore.user.id]
        );
      const smsConversation = existingDirectId
        ? await this.conversationRepository.queryConversationById(
            existingDirectId
          )
        : await this.session.getOrCreateSmsConversationByPeer(peer.id);

      await this.conversationKeyManager.deriveAndSetConversationKey(
        peer.id,
        conversation.id
      );
      await this.conversationKeyManager.deriveAndSetConversationKey(peer.id, smsConversation.id);

      // Prepare SMS message first — read its auto-assigned id before committing.
      const preparedSmsMessage = this.messageRepository.prepareMessageCreate({
        sender: this.userStore.user,
        content: message,
        conversation: smsConversation,
        messageType: MessageType.SMS,
      });

      // Prepare P2P message with the SMS id already linked.
      preparedP2pMessage = this.messageRepository.prepareMessageCreate({
        sender: this.userStore.user,
        content: message,
        conversation: conversation,
        linkedMessageId: preparedSmsMessage.id,
      });

      preparedP2pStatus =
        this.messageStatusRepository.prepareMessageStatusCreate({
          message: preparedP2pMessage,
          user: this.userStore.user,
          status: MessageStatusType.SENDING,
        });

      const preparedSmsStatus =
        this.messageStatusRepository.prepareMessageStatusCreate({
          message: preparedSmsMessage,
          user: this.userStore.user,
          status: MessageStatusType.SENDING,
        });

      // Single atomic write — link is set from the very first render.
      await database.write(() =>
        database.batch(
          preparedP2pMessage!,
          preparedSmsMessage,
          preparedP2pStatus!,
          preparedSmsStatus
        )
      );

      void this.conversationRepository.touchConversation(conversation.id);
      void this.conversationRepository.touchConversation(smsConversation.id);

      await this.sendAndTrackMessageStatus(
        preparedP2pMessage,
        preparedP2pStatus,
        message,
        peer,
        conversation
      );

      if (!this.userStore.isGuest) void this.syncService.syncNow();

      chatLog.debug("chat › send+sms complete", {
        peerId: peer.id,
        conversationId: conversation.id,
        p2pMessageId: preparedP2pMessage.id,
        smsMessageId: preparedSmsMessage.id,
      });

      return {
        conversationId: conversation.id,
        p2pMessageId: preparedP2pMessage.id,
        smsMessageId: preparedSmsMessage.id,
      };
    } catch (error) {
      const appErr = toAppError(error, "network");
      chatLog.error("chat › send+sms failed", {
        peerId: peer?.id,
        conversationId: conversation?.id,
        ...appErr,
      });
      if (preparedP2pMessage && preparedP2pStatus) {
        await this.messageStatusRepository
          .updateMessageStatusById(
            preparedP2pStatus.id,
            MessageStatusType.NOT_SENT
          )
          .catch((error) => chatLog.warn("chat › p2p status update failed (not_sent)", { error }));
        return {
          conversationId: conversation!.id,
          p2pMessageId: preparedP2pMessage.id,
          smsMessageId: "",
        };
      }
      captureAppError(appErr);
      throw appErr;
    }
  }

  async linkMessages(
    p2pMessageId: string,
    smsMessageId: string
  ): Promise<void> {
    try {
      const message = await this.messageRepository.queryMessageById(
        p2pMessageId
      );
      if (!message) {
        chatLog.warn("chat › linkMessages: p2p message not found", {
          p2pMessageId,
        });
        return;
      }
      await database.write(async () => {
        await message.update((m) => {
          m.linkedMessageId = smsMessageId;
        });
      });
      chatLog.debug("chat › linkMessages complete", {
        p2pMessageId,
        smsMessageId,
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › linkMessages failed", {
        p2pMessageId,
        smsMessageId,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  async updateMessageStatus(
    messageId: string,
    status: MessageStatusType
  ): Promise<void> {
    await this.messageStatusRepository.updateMessageStatusByMessage(
      messageId,
      status
    );
  }

  /**
   * Gets the status of a message by id.
   * @param messageId The message id
   * @returns Promise<MessageStatus>
   */
  async getMessageStatus(messageId: string): Promise<MessageStatus> {
    try {
      return await this.messageStatusRepository.queryMessageStatusByMessage(
        messageId
      );
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › message status failed", { messageId, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Gets all message statuses (for debugging/logging).
   * @returns Promise<void>
   */
  async getAllStatus(): Promise<void> {
    try {
      const statuses = await this.messageStatusRepository.queryAllStatuses();
      chatLog.debug("chat › statuses listed", { count: statuses.length });
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › statuses list failed", appErr);
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Gets all not sent messages for a given peer by checking message statuses.
   * @param peerId The peer id
   * @returns Promise<Message[]>
   */
  async getAllNotSentMessageForPeer(peerId: string): Promise<Message[]> {
    // get the conversation between peer
    try {
      const directConversationId =
        await this.conversationParticipantRepository.isDirectConversationExists(
          [peerId, this.userStore.user.id]
        );

      if (!directConversationId) return [];

      // get the all messages on the conversation
      const messages = await this.messageRepository.queryMessagesByConversation(
        directConversationId
      );
      const messageIds = messages.map((m) => m.id);
      chatLog.debug("chat › message ids loaded", {
        peerId,
        count: messageIds.length,
      });

      const unsentStatuses =
        await this.messageStatusRepository.queryNotSentByMessages(messageIds);

      const unsentStatusesIds: string[] = unsentStatuses.map(
        (u) => u.message.id
      );

      if (!unsentStatusesIds) return [];
      chatLog.debug("chat › unsent messages", {
        peerId,
        count: unsentStatusesIds.length,
      });

      return messages.filter((m) => unsentStatusesIds.includes(m.id));
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › unsent messages failed", { peerId, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Tries to resend a message to a peer by reconnecting and sending the message again.
   * @param message The message to resend
   * @param peerId The peer id
   * @param options The peer's ipAddress and port — required when WebSocket is not available (LAN-only mode)
   * @returns Promise<void>
   */
  async tryResendMessage(
    message: Message,
    peerId: string,
    options?: { ipAddress: string; port: number }
  ): Promise<void> {
    try {
      if (!this.connectionService.isWebSocketAllowed()) {
        // LAN mode: WebRTC over TCP is the only transport — connection must be pre-established.
        if (!options?.ipAddress || !options?.port) {
          throw new Error(
            "ipAddress and port are required when WebSocket is not available"
          );
        }
        await this.connectionService.connectToPeer(
          peerId,
          options.ipAddress,
          options.port
        );
        await this.connectionService.waitForDataChannel(peerId);
      }
      // The wire protocol carries plaintext (transport + at-rest encryption are
      // separate layers). The Message handed in here comes straight from the DB
      // observation, so message.content is the at-rest ciphertext. Derive the
      // conversation key and decrypt before sending, otherwise the receiver
      // double-encrypts the ciphertext and the message renders blank.
      await this.conversationKeyManager.deriveAndSetConversationKey(peerId, message.conversation.id);
      const plaintext = this.messageRepository.decryptMessage(message);
      if (plaintext.startsWith(ECDH_PREFIX)) {
        // Key not available yet — cannot recover plaintext. Leave NOT_SENT so the
        // user can retry once the key arrives (e.g. after TCP handshake).
        throw new Error(
          `Cannot resend ${message.id}: conversation key not yet derived`
        );
      }
      // Signal retry in progress.
      await this.messageStatusRepository.updateMessageStatusByMessage(
        message.id,
        MessageStatusType.SENDING
      );
      // auto/server mode: sendChatMessage tries WebRTC first, falls back to WS internally.
      // LAN mode: WebRTC is now connected from the block above.
      const transport = this.connectionService.sendChatMessage(peerId, {
        message: plaintext,
        conversationId: message.conversation.id,
        messageId: message.id,
        from: message.sender.id,
        to: peerId,
        sentAt: message.createdAt,
        messageType: message.messageType,
        senderProfile: {
          username: this.userStore.user.username,
          firstName: this.userStore.user.firstName,
          lastName: this.userStore.user.lastName || undefined,
        },
        linkedMessageId: message.linkedMessageId ?? undefined,
      });
      if (transport === "webrtc") {
        await this.messageStatusRepository.updateMessageStatusByMessage(
          message.id,
          MessageStatusType.SENT
        );
      } else {
        // WS path: start 12s timeout — if no server-ack arrives, flip to NOT_SENT
        // so the message re-enters the retry queue on the next reconnect.
        // Only downgrades SENDING/SENT — never overrides DELIVERED or READ.
        this.ackTracker.arm(message.id, async () => {
          await this.messageStatusRepository.updateToNotSentIfStillPendingByMessage(
            message.id
          );
        }, 12000);
      }
    } catch (error) {
      const appErr = toAppError(error, "network");
      chatLog.error("chat › resend failed", {
        peerId,
        messageId: message.id,
        conversationId: message.conversation.id,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Sends a chat message over the network and updates its status in the repository.
   * @param newMessage The message object
   * @param newMessageStatus The message status object
   * @param message The message content
   * @param peer The active peer
   * @param conversation The active conversation
   * @returns Promise<void>
   */
  private async sendAndTrackMessageStatus(
    newMessage: Message,
    newMessageStatus: MessageStatus,
    message: string,
    peer: Peer,
    conversation: Conversation
  ): Promise<void> {
    try {
      chatLog.debug("chat › send message", {
        messageId: newMessage.id,
        messageStatusId: newMessageStatus.id,
        conversationId: conversation.id,
        peerId: peer.id,
        messageLength: message.length,
      });
      // Start 12s ACK timeout — if no DELIVERED (WebRTC) or server-ack (WS) arrives,
      // flip back to NOT_SENT so the message is eligible for the retry queue.
      // Only downgrades SENDING/SENT — never overrides DELIVERED or READ.
      chatLog.info("chat › acktimeout sets");
      this.ackTracker.arm(newMessage.id, async () => {
        chatLog.warn("chat › sending message timeout", {
          messageId: newMessage.id,
          messageStatusId: newMessageStatus.id,
        });
        await this.messageStatusRepository.updateToNotSentIfStillPendingById(
          newMessageStatus.id
        );
      }, 12000);
      const transport = this.connectionService.sendChatMessage(peer.id, {
        message: message,
        conversationId: conversation.id,
        messageId: newMessage.id,
        to: peer.id,
        from: this.userStore.user.id,
        sentAt: newMessage.createdAt,
        messageType: newMessage.messageType,
        senderProfile: {
          username: this.userStore.user.username,
          firstName: this.userStore.user.firstName,
          lastName: this.userStore.user.lastName || undefined,
        },
        linkedMessageId: newMessage.linkedMessageId ?? undefined,
      });
      if (transport === "webrtc") {
        await this.messageStatusRepository.updateMessageStatusById(
          newMessageStatus.id,
          MessageStatusType.SENT
        );
      }
    } catch (error) {
      const appErr = toAppError(error, "network");
      chatLog.warn("chat › send failed", {
        messageId: newMessage.id,
        conversationId: conversation.id,
        peerId: peer.id,
        ...appErr,
      });
      await this.messageStatusRepository.updateMessageStatusById(
        newMessageStatus.id,
        MessageStatusType.NOT_SENT
      );
    }
  }

  /**
   * Creates a message and its status atomically in a single database transaction.
   * @param params Object containing sender, message, and conversation
   * @returns Promise<{ newMessage: Message; newMessageStatus: MessageStatus }>
   */
  private async createMessage(params: {
    sender: Peer | GuestUser;
    message: string;
    conversation: Conversation;
    messageType?: MessageType;
  }): Promise<{ newMessage: Message; newMessageStatus: MessageStatus }> {
    const { sender, message, conversation, messageType } = params;
    try {
      const preparedMessage = this.messageRepository.prepareMessageCreate({
        sender,
        content: message,
        conversation,
        messageType,
      });
      const preparedStatus =
        this.messageStatusRepository.prepareMessageStatusCreate({
          message: preparedMessage,
          user: sender,
          status: MessageStatusType.SENDING,
        });

      await database.write(() =>
        database.batch(preparedMessage, preparedStatus)
      );

      return { newMessage: preparedMessage, newMessageStatus: preparedStatus };
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › create message failed", {
        conversationId: conversation.id,
        senderId: sender.id,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }
}
