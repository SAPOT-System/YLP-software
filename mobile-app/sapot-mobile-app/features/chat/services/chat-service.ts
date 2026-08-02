import { ConnectionService } from "@/features/shared/connection";
import {
  Conversation,
  ConversationType,
  database,
  Message,
  MessageStatus,
  MessageStatusType,
  MessageType,
  Peer,
} from "@/features/shared/core/database";
import { PeerService } from "@/features/shared/peer";
import { UserStore } from "@/features/shared/core/stores";
import { directConversationId } from "@/features/chat/utils/direct-conversation-id";
import { smsConversationId } from "@/features/chat/utils/sms-conversation-id";
import { chatLog } from "@/features/shared/core/utils/logger";
import { ConversationKeyManager } from "@/features/chat/services/conversation-key-manager";
import {
  ConversationKeyStore,
  ConversationParticipantRepository,
  ConversationRepository,
  MessageRepository,
  MessageStatusRepository,
} from "../repositories";
import { DataChatMessageI } from "../types";
import { toAppError, captureAppError } from "@/features/shared/core/errors";
import { MessageAckTracker } from "./message-ack-tracker";
import { ChatReceiveService } from "./chat-receive-service";
import { ChatMessageService } from "./chat-message-service";

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
  private readonly receiveService: ChatReceiveService;
  private readonly messageService: ChatMessageService;

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
    this.messageService = new ChatMessageService(
      messageRepository,
      messageStatusRepository,
      connectionService,
      conversationRepository,
      conversationParticipantRepository,
      userStore,
      syncService,
      conversationKeyManager,
      this.ackTracker,
      {
        ensureConversationInitialized: () => this.ensureConversationInitialized(),
        getActivePeer: () => this.peer,
        getOrCreateSmsConversationByPeer: (peerId: string) => this.getOrCreateSmsConversationByPeer(peerId),
      },
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

      if (foundUser.role === "admin") {
        chatLog.info("chat › admin peer uses websocket relay", { peerId: id });
        void this.warmUpConversationKey(id);
        return;
      }

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

  /**
   * Keeps the exact conversation selected by the chat screen. Looking up a
   * conversation by participant pair here can select a different legacy admin
   * conversation and create duplicates on send.
   */
  async setConversation(conversationId: string): Promise<void> {
    const conversation = await this.conversationRepository.queryConversationById(
      conversationId
    );
    if (!conversation) throw new Error("Conversation not found");
    this.conversation = conversation;
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
  sendChatMessage(
    message: string,
    messageType?: MessageType
  ): Promise<{ conversationId: string; messageId: string }> {
    return this.messageService.sendChatMessage(message, messageType);
  }

  sendSmsChannelMessage(
    message: string
  ): Promise<{ conversationId: string; messageId: string }> {
    return this.messageService.sendSmsChannelMessage(message);
  }

  /**
   * Ensures the conversation property is initialized for sending a message. Creates a new conversation if needed.
   * @returns Promise<Conversation>
   */
  private async ensureConversationInitialized(): Promise<Conversation> {
    if (!this.conversation && this.peer) {
      if (this.peer.id === this.userStore.user.id) {
        const conversationId =
          await this.conversationParticipantRepository.isSelfConversationExists(
            this.peer.id
          );
        this.conversation = conversationId
          ? await this.conversationRepository.queryConversationById(
              conversationId
            )
          : await this.receiveService.createChatRoom(this.peer);
      } else {
        // Same resolver the peer list and call log use, so a first send joins
        // the pair's deterministic conversation instead of forking a
        // random-UUID one the peer will never converge on.
        this.conversation = await this.getOrCreateDirectConversationByPeer(
          this.peer.id
        );
      }
    }
    return this.conversation!;
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
   * Resolves the direct conversation this pair already shares, without creating
   * one. Deterministic id first — a conversation created by the peer or by the
   * admin console can be synced down before its participant rows arrive, and a
   * participant-only lookup would miss it and open an empty room.
   * @param peerId The peer id
   * @returns Promise<string | undefined>
   */
  private async resolveDirectConversationId(
    peerId: string
  ): Promise<string | undefined> {
    const deterministicId = directConversationId(
      this.userStore.user.id,
      peerId
    );
    const existsById =
      await this.conversationRepository.isConversationExist(deterministicId);
    if (existsById) return deterministicId;

    // Participant-based fallback — finds random-UUID conversations created
    // before deterministic ids were introduced.
    return await this.conversationParticipantRepository.isDirectConversationExists(
      [peerId, this.userStore.user.id]
    );
  }

  /**
   * Finds the chat id by peer id.
   * @param peerId The peer id
   * @returns Promise<string | undefined>
   */
  async findChatByPeer(peerId: string): Promise<string | undefined> {
    try {
      const directId = await this.resolveDirectConversationId(peerId);
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
        if (conversationId) {
          const existsById =
            await this.conversationRepository.isConversationExist(effectiveId);
          if (existsById) {
            return await this.conversationRepository.queryConversationById(
              effectiveId
            );
          }
        }

        const existingConversationId =
          await this.resolveDirectConversationId(peer.id);
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

  updateMessageStatus(messageId: string, status: MessageStatusType): Promise<void> {
    return this.messageService.updateMessageStatus(messageId, status);
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
  getMessageStatus(messageId: string): Promise<MessageStatus> {
    return this.messageService.getMessageStatus(messageId);
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
  getAllStatus(): Promise<void> {
    return this.messageService.getAllStatus();
  }

  /**
   * Gets all not sent messages for a given peer by checking message statuses.
   * @param peerId The peer id
   * @returns Promise<Message[]>
   */
  getAllNotSentMessageForPeer(peerId: string): Promise<Message[]> {
    return this.messageService.getAllNotSentMessageForPeer(peerId);
  }

  /**
   * Tries to resend a message to a peer by reconnecting and sending the message again.
   * @param message The message to resend
   * @param peerId The peer id
   * @param options The peer's ipAddress and port — required when WebSocket is not available (LAN-only mode)
   * @returns Promise<void>
   */
  tryResendMessage(
    message: Message,
    peerId: string,
    options?: { ipAddress: string; port: number }
  ): Promise<void> {
    return this.messageService.tryResendMessage(message, peerId, options);
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
