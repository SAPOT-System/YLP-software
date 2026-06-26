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
  PeerService,
  UserStore,
} from "@/features/shared";
import { directConversationId } from "@/features/chat/utils/direct-conversation-id";
import { smsConversationId } from "@/features/chat/utils/sms-conversation-id";
import { chatLog } from "@/features/shared/utils/logger";
import { ConversationKeyManager } from "@/features/shared/services/conversation-key-manager";
import { ECDH_PREFIX } from "../repositories/message-repository";
import {
  ConversationKeyStore,
  ConversationParticipantRepository,
  ConversationRepository,
  MessageRepository,
  MessageStatusRepository,
} from "../repositories";
import { DataChatMessageI } from "../types";
import { toAppError, captureAppError } from "@/features/shared/errors";
import { MessageReceiptManager } from "./message-receipt-manager";
import { MessageAckTracker } from "./message-ack-tracker";
import { ChatReceiveService } from "./chat-receive-service";

chatLog.debug("[chat-service] module loaded");

type ChatSyncService = {
  syncNow(): Promise<void>;
};

/**
 * ChatService is responsible for managing chat/conversation logic, including peer connections, message sending/receiving,
 * repository coordination, and state management. It encapsulates business rules for chat flows and ensures ACID principles where possible.
 */
export class ChatService {
  private peer?: Peer;
  private conversation?: Conversation;
  private readonly ackTracker = new MessageAckTracker();
  private messageReceiptManager = new MessageReceiptManager();
  private readonly receiveService: ChatReceiveService;

  /**
   * Constructs a ChatService instance.
   * @param connectionService Handles peer-to-peer network connections
   * @param conversationRepository Repository for conversation data
   * @param conversationParticipantRepository Repository for conversation participants
   * @param messageRepository Repository for messages
   * @param messageStatusRepository Repository for message statuses
   * @param peerService Service for peer management
   * @param userStore Store for user state
   */
  constructor(
    private connectionService: ConnectionService,
    private conversationRepository: ConversationRepository,
    private conversationParticipantRepository: ConversationParticipantRepository,
    private messageRepository: MessageRepository,
    private conversationKeyStore: ConversationKeyStore,
    private messageStatusRepository: MessageStatusRepository,
    private peerService: PeerService,
    private userStore: UserStore,
    private syncService: ChatSyncService,
    private conversationKeyManager: ConversationKeyManager,
  ) {
    this.receiveService = new ChatReceiveService(
      peerService,
      messageRepository,
      messageStatusRepository,
      conversationRepository,
      conversationParticipantRepository,
      connectionService,
      userStore,
      syncService,
      conversationKeyManager,
      this.ackTracker,
    );
    chatLog.info("chat › service constructed", {
      hasConnectionService: Boolean(connectionService),
      hasConversationRepository: Boolean(conversationRepository),
      hasConversationParticipantRepository: Boolean(
        conversationParticipantRepository
      ),
      hasMessageRepository: Boolean(messageRepository),
      hasMessageStatusRepository: Boolean(messageStatusRepository),
      hasPeerService: Boolean(peerService),
      hasUserStore: Boolean(userStore),
    });
  }

  /**
   * Returns the message receipt manager for filtering receipt statuses during sync.
   */
  getMessageReceiptManager(): MessageReceiptManager {
    return this.messageReceiptManager;
  }

  private async deriveAndSetConversationKey(
    peerId: string,
    conversationId: string,
  ): Promise<void> {
    await this.conversationKeyManager.deriveAndSetConversationKey(peerId, conversationId);
  }

  private async warmUpConversationKey(peerId: string): Promise<void> {
    try {
      const conversationId =
        await this.conversationParticipantRepository.isDirectConversationExists(
          [peerId, this.userStore.user.id],
          ConversationType.DIRECT,
        );
      if (!conversationId) return;
      await this.deriveAndSetConversationKey(peerId, conversationId);
    } catch (error) {
      chatLog.debug("chat › warmUp key failed", { peerId, error });
    }
  }

  onConnectionState(
    listener: (payload: {
      peerId: string;
      state: "connecting" | "connected" | "failed" | "timeout";
      transport: "ws" | "tcp" | "none";
      mode: "auto" | "server" | "lan";
      error?: unknown;
    }) => void
  ) {
    this.connectionService.on("connection-state", listener);
    return () => {
      if (typeof this.connectionService.off === "function") {
        this.connectionService.off("connection-state", listener);
        return;
      }
      this.connectionService.removeListener("connection-state", listener);
    };
  }

  onPeerReconnected(listener: (peerId: string) => void): () => void {
    this.connectionService.on("peer-reconnected", listener);
    return () => {
      if (typeof this.connectionService.off === "function") {
        this.connectionService.off("peer-reconnected", listener);
        return;
      }
      this.connectionService.removeListener("peer-reconnected", listener);
    };
  }

  onCallReconnecting(listener: (peerId: string) => void): () => void {
    this.connectionService.on("call-reconnecting", listener);
    return () => {
      if (typeof this.connectionService.off === "function") {
        this.connectionService.off("call-reconnecting", listener);
        return;
      }
      this.connectionService.removeListener("call-reconnecting", listener);
    };
  }

  onPeerRediscovered(listener: (peerId: string) => void): () => void {
    this.connectionService.on("peer-rediscovered", listener);
    return () => {
      if (typeof this.connectionService.off === "function") {
        this.connectionService.off("peer-rediscovered", listener);
        return;
      }
      this.connectionService.removeListener("peer-rediscovered", listener);
    };
  }

  /**
   * Connects to a peer by id, establishing a network connection for chat.
   * @param id The peer id to connect to
   * @returns Promise<void>
   */
  async connect(id: string): Promise<void> {
    try {
      chatLog.info("chat › connect start", { peerId: id });
      const foundUser = await this.peerService.findPeerById(id);
      if (!foundUser) throw new Error("Peer not found");
      this.peer = foundUser;

      try {
        const discoveredPeer = this.peerService.findDiscoveredPeerById(id);

        if (!discoveredPeer) throw new Error("Peer not discovered");

        await this.connectionService.connectToPeer(
          discoveredPeer.id,
          discoveredPeer.ipAddress,
          discoveredPeer.port,
          discoveredPeer.addresses
        );
      } catch {
        await this.connectionService.connectToPeer(id);
      }
      chatLog.info("chat › connect complete", { peerId: id });
      void this.warmUpConversationKey(id);
    } catch (error) {
      const appErr = toAppError(error, "network");
      chatLog.warn("chat › connect failed", { peerId: id, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Disconnects the current chat session, clearing peer and conversation state.
   */
  disconnect(): void {
    try {
      chatLog.info("chat › disconnect", {
        hadPeer: Boolean(this.peer),
        hadConversation: Boolean(this.conversation),
      });
      this.conversation = undefined;
      this.peer = undefined;
    } catch (error) {
      const appErr = toAppError(error, "network");
      chatLog.error("chat › disconnect failed", appErr);
      captureAppError(appErr);
      throw appErr;
    }
  }

  async setPeer(id: string) {
    chatLog.info("chat › set peer start", { peerId: id });
    const foundUser = await this.peerService.findPeerById(id);
    if (!foundUser) throw new Error("Peer not found");
    this.peer = foundUser;
  }

  removePeer() {
    this.peer = undefined;
  }

  hasPeer(): boolean {
    return this.peer !== undefined;
  }

  // TODO: Apply ACID principle and retry if failed

  /**
   * Handles an incoming chat message: finds/creates sender and conversation, saves the message, and sends an acknowledgment.
   * @param data Incoming chat message data
   * @returns Promise<void>
   */
  handleIncomingChatMessage(data: DataChatMessageI): Promise<void> {
    return this.receiveService.handleIncomingChatMessage(data);
  }

  /**
   * Sends an acknowledgment for an incoming message to the sender.
   * @param senderId The sender's peer id
   * @param messageId The message id to acknowledge
   */
  acknowledgeIncomingMessage(senderId: string, messageId: string): void {
    return this.receiveService.acknowledgeIncomingMessage(senderId, messageId);
  }

  /**
   * Handles an incoming seen message from the receiver, updating all DELIVERED/SENT messages
   * in the conversation (sent by the current user) to READ.
   * @param conversationId The conversation id that was seen
   * @returns Promise<void>
   */
  handleSeenMessage(conversationId: string): Promise<void> {
    return this.receiveService.handleSeenMessage(conversationId);
  }

  /**
   * Sends a seen notification to the current peer for the active conversation.
   * Called by the receiver when they open/view a conversation.
   * @param conversationId The conversation id to mark as read
   */
  markConversationAsRead(conversationId: string): Promise<void> {
    return this.receiveService.markConversationAsRead(conversationId, this.peer);
  }

  /**
   * Handles an incoming acknowledgment message for a given messageId, updating its status to SENT.
   * @param messageId The message id to acknowledge
   * @returns Promise<void>
   */
  handleServerAck(messageId: string): Promise<void> {
    return this.receiveService.handleServerAck(messageId);
  }

  handleAckMessage(messageId: string): Promise<void> {
    return this.receiveService.handleAckMessage(messageId);
  }

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
    if (!this.peer) throw new Error("No peer state stored");

    let newMessage: Message | undefined;
    let newMessageStatus: MessageStatus | undefined;

    try {
      chatLog.debug("chat › send chat start", {
        peerId: this.peer.id,
        messageLength: message.length,
      });
      await this.ensureConversationInitialized();
      await this.deriveAndSetConversationKey(
        this.peer!.id,
        this.conversation!.id
      );
      ({ newMessage, newMessageStatus } = await this.createMessage({
        sender: this.userStore.user,
        message: message,
        conversation: this.conversation!,
        messageType,
      }));
      void this.conversationRepository.touchConversation(this.conversation!.id);
      const isSelfChat = this.peer.id === this.userStore.user.id;
      if (isSelfChat) {
        await this.messageStatusRepository.updateMessageStatusById(
          newMessageStatus.id,
          MessageStatusType.SENT
        );
        chatLog.debug("chat › send complete (self)", {
          peerId: this.peer.id,
          conversationId: this.conversation?.id,
          messageId: newMessage.id,
        });
        if (!this.userStore.isGuest) void this.syncService.syncNow();
        return {
          conversationId: this.conversation!.id,
          messageId: newMessage.id,
        };
      }
      await this.sendAndTrackMessageStatus(
        newMessage,
        newMessageStatus,
        message
      );
      if (!this.userStore.isGuest) void this.syncService.syncNow();
      chatLog.debug("chat › send complete", {
        peerId: this.peer.id,
        conversationId: this.conversation?.id,
        messageId: newMessage.id,
      });
      return {
        conversationId: this.conversation!.id,
        messageId: newMessage.id,
      };
    } catch (error) {
      const appErr = toAppError(error, "network");
      chatLog.error("chat › send failed", {
        peerId: this.peer?.id,
        conversationId: this.conversation?.id,
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
          conversationId: this.conversation!.id,
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
    if (!this.peer) throw new Error("No peer state stored");
    const existingDirectId =
      (await this.conversationParticipantRepository.isDirectConversationExists([
        this.peer.id,
        this.userStore.user.id,
      ])) ??
      (await this.conversationParticipantRepository.isDirectConversationExists(
        [this.peer.id, this.userStore.user.id],
        ConversationType.SMS
      ));
    const smsConversation = existingDirectId
      ? await this.conversationRepository.queryConversationById(
          existingDirectId
        )
      : await this.getOrCreateSmsConversationByPeer(this.peer.id);
    await this.deriveAndSetConversationKey(this.peer.id, smsConversation.id);
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
    if (!this.peer) throw new Error("No peer state stored");

    let preparedP2pMessage: Message | undefined;
    let preparedP2pStatus: MessageStatus | undefined;

    try {
      chatLog.debug("chat › send+sms start", {
        peerId: this.peer.id,
        messageLength: message.length,
      });
      await this.ensureConversationInitialized();

      const existingDirectId =
        await this.conversationParticipantRepository.isDirectConversationExists(
          [this.peer.id, this.userStore.user.id]
        );
      const smsConversation = existingDirectId
        ? await this.conversationRepository.queryConversationById(
            existingDirectId
          )
        : await this.getOrCreateSmsConversationByPeer(this.peer.id);

      await this.deriveAndSetConversationKey(
        this.peer.id,
        this.conversation!.id
      );
      await this.deriveAndSetConversationKey(this.peer.id, smsConversation.id);

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
        conversation: this.conversation!,
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

      void this.conversationRepository.touchConversation(this.conversation!.id);
      void this.conversationRepository.touchConversation(smsConversation.id);

      await this.sendAndTrackMessageStatus(
        preparedP2pMessage,
        preparedP2pStatus,
        message
      );

      if (!this.userStore.isGuest) void this.syncService.syncNow();

      chatLog.debug("chat › send+sms complete", {
        peerId: this.peer.id,
        conversationId: this.conversation!.id,
        p2pMessageId: preparedP2pMessage.id,
        smsMessageId: preparedSmsMessage.id,
      });

      return {
        conversationId: this.conversation!.id,
        p2pMessageId: preparedP2pMessage.id,
        smsMessageId: preparedSmsMessage.id,
      };
    } catch (error) {
      const appErr = toAppError(error, "network");
      chatLog.error("chat › send+sms failed", {
        peerId: this.peer?.id,
        conversationId: this.conversation?.id,
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
          conversationId: this.conversation!.id,
          p2pMessageId: preparedP2pMessage.id,
          smsMessageId: "",
        };
      }
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Ensures the conversation property is initialized for sending a message. Creates a new conversation if needed.
   * @returns Promise<void>
   */
  private async ensureConversationInitialized(): Promise<void> {
    if (!this.conversation && this.peer) {
      let conversationId;
      if (this.peer.id === this.userStore.user.id) {
        conversationId =
          await this.conversationParticipantRepository.isSelfConversationExists(
            this.peer.id
          );
      } else {
        conversationId =
          await this.conversationParticipantRepository.isDirectConversationExists(
            [this.peer.id, this.userStore.user.id]
          );
      }
      if (!conversationId) {
        this.conversation = await this.receiveService.createChatRoom(this.peer);
      } else {
        this.conversation =
          await this.conversationRepository.queryConversationById(
            conversationId
          );
      }
    }
  }

  /**
   * Sends a chat message over the network and updates its status in the repository.
   * @param newMessage The message object
   * @param newMessageStatus The message status object
   * @param message The message content
   * @returns Promise<void>
   */
  private async sendAndTrackMessageStatus(
    newMessage: Message,
    newMessageStatus: MessageStatus,
    message: string
  ): Promise<void> {
    try {
      chatLog.debug("chat › send message", {
        messageId: newMessage.id,
        messageStatusId: newMessageStatus.id,
        conversationId: this.conversation?.id,
        peerId: this.peer?.id,
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
      const transport = this.connectionService.sendChatMessage(this.peer!.id, {
        message: message,
        conversationId: this.conversation!.id,
        messageId: newMessage.id,
        to: this.peer!.id,
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
        conversationId: this.conversation?.id,
        peerId: this.peer?.id,
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

  // TODO: Determine if the conversation is direct or group conversation for integrating group conversation soon
  // For now, I assume that we don't have group conversationt
  // This is used by conversation room when the source is conversation list.

  /**
   * Finds the peer id by chat id. Used by conversation room when the source is conversation list.
   * @param chatId The chat id
   * @returns Promise<string>
   */
  async findPeerIdByChatId(chatId: string): Promise<string> {
    try {
      const participants =
        await this.conversationParticipantRepository.queryPeerByChatId(
          chatId,
          this.userStore.user.id
        );
      return participants[0].user.id;
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › peer id by chat failed", { chatId, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Finds the chat id by peer id.
   * @param peerId The peer id
   * @returns Promise<string | undefined>
   */
  async findChatByPeer(peerId: string): Promise<string | undefined> {
    try {
      const directId =
        await this.conversationParticipantRepository.isDirectConversationExists(
          [peerId, this.userStore.user.id]
        );
      if (directId) return directId;

      // Fall back to SMS conversation using the deterministic ID so the lookup
      // doesn't depend on participant records being present.
      const smsId = smsConversationId(this.userStore.user.id, peerId);
      const smsExists =
        await this.conversationRepository.isConversationExist(smsId);
      return smsExists ? smsId : undefined;
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › chat by peer failed", { peerId, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  async getOrCreateDirectConversationByPeer(
    peerId: string,
    conversationId?: string
  ): Promise<Conversation> {
    try {
      const peer = await this.peerService.findPeerById(peerId);
      if (!peer) throw new Error("Peer not found");

      // Use the supplied id or derive a deterministic one for this peer pair.
      // Both peers independently compute the same id, so new conversations
      // always converge on a single record without coordination.
      const effectiveId =
        conversationId ?? directConversationId(this.userStore.user.id, peerId);

      // Atomic find-or-create: serialized via database.write so two concurrent
      // callers cannot both pass the existence check and create a duplicate row.
      return await database.write(async () => {
        const existsById =
          await this.conversationRepository.isConversationExist(effectiveId);
        if (existsById) {
          return await this.conversationRepository.queryConversationById(
            effectiveId
          );
        }

        // Participant-based fallback — returns existing random-UUID conversations
        // created before deterministic IDs were introduced.
        const existingConversationId =
          await this.conversationParticipantRepository.isDirectConversationExists(
            [peer.id, this.userStore.user.id]
          );
        if (existingConversationId) {
          return await this.conversationRepository.queryConversationById(
            existingConversationId
          );
        }

        const conversation = await this.conversationRepository.saveConversation(
          { type: ConversationType.DIRECT, id: effectiveId },
          true
        );
        await this.conversationParticipantRepository.saveMultipleConversationParticipant(
          [peer, this.userStore.user],
          conversation,
          true
        );
        chatLog.info("chat › room create", {
          peerId: peer.id,
          conversationId: conversation.id,
          deterministic: !conversationId,
        });
        return conversation;
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › direct conversation resolve/create failed", {
        peerId,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  async getOrCreateSmsConversationByPeer(
    peerId: string
  ): Promise<Conversation> {
    try {
      const peer = await this.peerService.findPeerById(peerId);
      if (!peer) throw new Error("Peer not found");

      const effectiveId = smsConversationId(this.userStore.user.id, peerId);

      return await database.write(async () => {
        const existsById =
          await this.conversationRepository.isConversationExist(effectiveId);
        if (existsById) {
          return await this.conversationRepository.queryConversationById(
            effectiveId
          );
        }

        const conversation = await this.conversationRepository.saveConversation(
          { type: ConversationType.SMS, id: effectiveId },
          true
        );
        await this.conversationParticipantRepository.saveMultipleConversationParticipant(
          [peer, this.userStore.user],
          conversation,
          true
        );
        chatLog.info("chat › sms room create", {
          peerId: peer.id,
          conversationId: conversation.id,
        });
        return conversation;
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › sms conversation resolve/create failed", {
        peerId,
        ...appErr,
      });
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
   * Gets all conversations from the repository.
   * @returns Promise<Conversation[]>
   */
  async getAllConversations(): Promise<Conversation[]> {
    try {
      return await this.conversationRepository.queryAllConversation();
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › list conversations failed", appErr);
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Gets all messages from a conversation.
   * @param conversationId The conversation id
   * @returns Promise<Message[]>
   */
  async getMessagesFromConversation(
    conversationId: string
  ): Promise<Message[]> {
    try {
      const peerId =
        this.peer?.id ??
        (await this.conversationParticipantRepository
          .queryPeerByChatId(conversationId, this.userStore.user.id)
          .then((participants) => participants[0]?.user.id)
          .catch(() => undefined));
      if (peerId) {
        await this.deriveAndSetConversationKey(peerId, conversationId);
      }
      return await this.messageRepository.queryMessagesByConversation(
        conversationId
      );
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › messages by conversation failed", {
        conversationId,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
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
   * Gets all participants in all conversations (for debugging/logging).
   * @returns Promise<void>
   */
  async getAllParticipants(): Promise<void> {
    try {
      const participants =
        await this.conversationParticipantRepository.queryAllParticipants();
      chatLog.debug("chat › participants listed", {
        count: participants.length,
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.error("chat › participants list failed", appErr);
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
      await this.deriveAndSetConversationKey(peerId, message.conversation.id);
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
   * Cleans up the chat service state, clearing peer and conversation references.
   */
  cleanUp(): void {
    this.peer = undefined;
    this.conversation = undefined;
    this.ackTracker.clearAll();
  }

  /**
   * Deletes all conversations, messages, statuses, and participants (for debugging/testing purposes).
   * @returns Promise<void>
   */
  async deleteAllConversations(): Promise<void> {
    await database.write(async () => {
      const convOps =
        await this.conversationRepository.getConversationDestroyOps();
      const msgOps = await this.messageRepository.getAllMessageDestroyOps();
      const statusOps =
        await this.messageStatusRepository.getStatusDestroyOps();
      const partOps =
        await this.conversationParticipantRepository.getParticipantDestroyOps();
      await database.batch(...convOps, ...msgOps, ...statusOps, ...partOps);
    });
  }
}
