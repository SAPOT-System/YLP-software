import {
  ConnectionService,
  Conversation,
  ConversationType,
  database,
  GuestUser,
  Message,
  MessageStatus,
  MessageStatusType,
  Peer,
  PeerService,
  UserStore,
} from "@/features/shared";
import { chatLog } from "@/features/shared/utils/logger";
import {
  ConversationParticipantRepository,
  ConversationRepository,
  MessageRepository,
  MessageStatusRepository,
} from "../repositories";
import { DataChatMessageI } from "../types";

chatLog.debug("[chat-service] module loaded");

/**
 * ChatService is responsible for managing chat/conversation logic, including peer connections, message sending/receiving,
 * repository coordination, and state management. It encapsulates business rules for chat flows and ensures ACID principles where possible.
 */
export class ChatService {
  private peer?: Peer;
  private conversation?: Conversation;
  private ackTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
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
    private messageStatusRepository: MessageStatusRepository,
    private peerService: PeerService,
    private userStore: UserStore
  ) {
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
          discoveredPeer.port
        );
      } catch {
        await this.connectionService.connectToPeer(id);
      }
      chatLog.info("chat › connect complete", { peerId: id });
    } catch (error) {
      chatLog.warn("chat › connect failed", { peerId: id, error });
      throw error;
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
      chatLog.error("chat › disconnect failed", { error });
      throw error;
    }
  }

  // TODO: Apply ACID principle and retry if failed

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
      const conversation = await this.getOrCreateConversationForIncoming(
        sender,
        data.conversationId
      );
      await this.saveIncomingMessage(sender, conversation, data);
      this.acknowledgeIncomingMessage(sender.id, data.messageId);
    } catch (error) {
      chatLog.error("chat › incoming message failed", {
        conversationId: data.conversationId,
        messageId: data.messageId,
        senderId: data.from,
        error,
      });
      throw error;
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
    conversationId: string
  ): Promise<Conversation> {
    const isConversationExist =
      await this.conversationRepository.isConversationExist(conversationId);
    chatLog.debug("chat › conversation exists", {
      conversationId,
      exists: isConversationExist,
    });
    if (!isConversationExist) {
      return await this.createChatRoom(sender, conversationId);
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
    // TODO: save message with the received incoming message ID
    await this.messageRepository.saveMessage({
      sender: sender,
      content: data.message,
      conversation: conversation,
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
  private acknowledgeIncomingMessage(
    senderId: string,
    messageId: string
  ): void {
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
      chatLog.error("chat › seen handling failed", { conversationId, error });
      throw error;
    }
  }

  /**
   * Sends a seen notification to the current peer for the active conversation.
   * Called by the receiver when they open/view a conversation.
   * @param conversationId The conversation id to mark as read
   */
  markConversationAsRead(conversationId: string): void {
    if (!this.peer) return;
    try {
      chatLog.debug("chat › mark as read", {
        conversationId,
        peerId: this.peer.id,
      });
      this.connectionService.sendSeenMessage(this.peer.id, conversationId);
    } catch (error) {
      chatLog.warn("chat › mark as read failed", { conversationId, error });
    }
  }

  /**
   * Handles an incoming acknowledgment message for a given messageId, updating its status to DELIVERED.
   * @param messageId The message id to acknowledge
   * @returns Promise<void>
   */
  async handleAckMessage(messageId: string): Promise<void> {
    try {
      chatLog.debug("chat › ack received", { messageId });

      const timeout = this.ackTimeouts.get(messageId);
      if (timeout) {
        clearTimeout(timeout);
        this.ackTimeouts.delete(messageId);
      }

      await this.messageStatusRepository.updateMessageStatusByMessage(
        messageId,
        MessageStatusType.DELIVERED
      );
    } catch (error) {
      chatLog.error("chat › ack handling failed", { messageId, error });
      throw error;
    }
  }

  // TODO: make a transaction on this function to follow ACID principle
  // TODO: make a logic where user can send conversation even if the receiver is not online. Store the sent conversation and wait for receiver to be online.
  // This method will use the current class state about peer and conversation

  /**
   * Sends a chat message to the current peer, ensuring conversation state and updating message status.
   * @param message The message content
   * @returns Promise<string> The conversation id
   */
  async sendChatMessage(message: string): Promise<string> {
    try {
      if (!this.peer) throw new Error("No peer state stored");
      chatLog.debug("chat › send start", {
        peerId: this.peer.id,
        messageLength: message.length,
      });
      await this.ensureConversationInitialized();
      const { newMessage, newMessageStatus } = await this.createMessage({
        sender: this.userStore.user,
        message: message,
        conversation: this.conversation!,
      });
      await this.sendAndTrackMessageStatus(
        newMessage,
        newMessageStatus,
        message
      );
      chatLog.debug("chat › send complete", {
        peerId: this.peer.id,
        conversationId: this.conversation?.id,
        messageId: newMessage.id,
      });
      return this.conversation!.id;
    } catch (error) {
      chatLog.error("chat › send failed", {
        peerId: this.peer?.id,
        conversationId: this.conversation?.id,
        error,
      });
      throw error;
    }
  }

  /**
   * Ensures the conversation property is initialized for sending a message. Creates a new conversation if needed.
   * @returns Promise<void>
   */
  private async ensureConversationInitialized(): Promise<void> {
    if (!this.conversation && this.peer) {
      const conversationId =
        await this.conversationParticipantRepository.isDirectConversationExists(
          [this.peer.id, this.userStore.user.id]
        );
      if (!conversationId) {
        this.conversation = await this.createChatRoom(this.peer);
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
        conversationId: this.conversation?.id,
        peerId: this.peer?.id,
        messageLength: message.length,
      });
      this.connectionService.sendChatMessage(this.peer!.id, {
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
      });
      await this.messageStatusRepository.updateMessageStatusById(
        newMessageStatus.id,
        MessageStatusType.SENT
      );
      // Start 12s ACK timeout — if no DELIVERED arrives, flip back to NOT_SENT
      // so the message becomes eligible for the retry queue on next reconnect.
      const timeout = setTimeout(async () => {
        this.ackTimeouts.delete(newMessage.id);
        await this.messageStatusRepository.updateMessageStatusById(
          newMessageStatus.id,
          MessageStatusType.NOT_SENT
        );
      }, 12000);
      this.ackTimeouts.set(newMessage.id, timeout);
    } catch (error) {
      chatLog.warn("chat › send failed", {
        messageId: newMessage.id,
        conversationId: this.conversation?.id,
        peerId: this.peer?.id,
        error,
      });
      await this.messageStatusRepository.updateMessageStatusById(
        newMessageStatus.id,
        MessageStatusType.NOT_SENT
      );
    }
  }

  // TODO: Apply transaction

  /**
   * Creates a message and its status in a transaction.
   * @param params Object containing sender, message, and conversation
   * @returns Promise<{ newMessage: Message; newMessageStatus: MessageStatus }>
   */
  private async createMessage(params: {
    sender: Peer | GuestUser;
    message: string;
    conversation: Conversation;
  }): Promise<{ newMessage: Message; newMessageStatus: MessageStatus }> {
    const { sender, message, conversation } = params;
    try {
      const newMessage = await this.messageRepository.saveMessage({
        sender: sender,
        content: message,
        conversation: conversation,
      });
      const newMessageStatus =
        await this.messageStatusRepository.saveMessageStatus({
          message: newMessage,
          user: sender,
          status: MessageStatusType.SENDING,
        });

      return { newMessage, newMessageStatus };
    } catch (error) {
      chatLog.error("chat › create message failed", {
        conversationId: conversation.id,
        senderId: sender.id,
        error,
      });
      throw error;
    }
  }

  /**
   * Creates a chat room (conversation) with the given peer, and adds both users as participants.
   * @param peer The peer to create the chat room with
   * @param conversationId Optional conversation id
   * @returns Promise<Conversation>
   */
  private async createChatRoom(
    peer: Peer,
    conversationId?: string
  ): Promise<Conversation> {
    // Wrap into write method to ensure ACID for safety transaction
    try {
      chatLog.info("chat › room create", {
        peerId: peer.id,
        hasConversationId: Boolean(conversationId),
      });
      return await database.write(async () => {
        const conversation = await this.conversationRepository.saveConversation(
          {
            type: ConversationType.DIRECT,
            id: conversationId,
          },
          true
        );
        await this.conversationParticipantRepository.saveMultipleConversationParticipant(
          [peer, this.userStore.user],
          conversation,
          true
        );
        return conversation;
      });
    } catch (error) {
      chatLog.error("chat › create room failed", {
        peerId: peer.id,
        conversationId,
        error,
      });
      throw error;
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
      chatLog.error("chat › peer id by chat failed", { chatId, error });
      throw error;
    }
  }

  /**
   * Finds the chat id by peer id.
   * @param peerId The peer id
   * @returns Promise<string | undefined>
   */
  async findChatByPeer(peerId: string): Promise<string | undefined> {
    try {
      const chat =
        await this.conversationParticipantRepository.queryConversationByPeer(
          peerId,
          this.userStore.user.id
        );

      if (chat.length <= 0) return undefined;

      return chat[0].conversation.id;
    } catch (error) {
      chatLog.error("chat › chat by peer failed", { peerId, error });
      throw error;
    }
  }

  async getOrCreateDirectConversationByPeer(
    peerId: string,
    conversationId?: string
  ): Promise<Conversation> {
    try {
      const peer = await this.peerService.findPeerById(peerId);
      if (!peer) throw new Error("Peer not found");
      const existingConversationId =
        await this.conversationParticipantRepository.isDirectConversationExists(
          [peer.id, this.userStore.user.id]
        );

      if (existingConversationId) {
        return await this.conversationRepository.queryConversationById(
          existingConversationId
        );
      }

      return await this.createChatRoom(peer, conversationId);
    } catch (error) {
      chatLog.error("chat › direct conversation resolve/create failed", {
        peerId,
        error,
      });
      throw error;
    }
  }

  async saveCallLogWithReceipts(params: {
    peerId: string;
    content: string;
    status?: MessageStatusType;
    senderId: string;
    messageId?: string;
  }) {
    const {
      peerId,
      content,
      status = MessageStatusType.DELIVERED,
      senderId,
      messageId,
    } = params;

    if (senderId !== this.userStore.user.id && senderId !== peerId) {
      throw new Error("senderId must be current user or peerId");
    }

    try {
      if (messageId) {
        const existingMessage = await this.messageRepository.queryMessageById(
          messageId
        );
        if (existingMessage) {
          chatLog.info("chat › call log deduped", {
            peerId,
            messageId,
          });
          return;
        }
      }

      const peer = await this.peerService.findPeerById(peerId);
      if (!peer) throw new Error("Peer not found");
      const conversation = await this.getOrCreateDirectConversationByPeer(
        peerId
      );

      const sender: Peer | GuestUser =
        senderId === this.userStore.user.id ? this.userStore.user : peer;

      const newMessage = await this.messageRepository.saveMessage({
        sender,
        content,
        conversation,
        messageId,
      });
      if (senderId === this.userStore.user.id) {
        await this.messageStatusRepository.saveMessageStatus({
          message: newMessage,
          user: sender,
          status,
        });
      }

      chatLog.info("chat › call log saved", {
        peerId,
        conversationId: conversation.id,
        messageId: newMessage.id,
        senderId: sender.id,
        status,
      });
    } catch (error) {
      chatLog.error("chat › call log save failed", {
        peerId,
        contentLength: content.length,
        status,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets all conversations from the repository.
   * @returns Promise<Conversation[]>
   */
  async getAllConversations(): Promise<Conversation[]> {
    try {
      return await this.conversationRepository.queryAllConversation();
    } catch (error) {
      chatLog.error("chat › list conversations failed", { error });
      throw error;
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
      return await this.messageRepository.queryMessagesByConversation(
        conversationId
      );
    } catch (error) {
      chatLog.error("chat › messages by conversation failed", {
        conversationId,
        error,
      });
      throw error;
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
      chatLog.error("chat › message status failed", { messageId, error });
      throw error;
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
      chatLog.error("chat › participants list failed", { error });
      throw error;
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
      chatLog.error("chat › statuses list failed", { error });
      throw error;
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
      const conversation =
        await this.conversationParticipantRepository.queryConversationByPeer(
          peerId,
          this.userStore.user.id
        );

      if (conversation.length <= 0) return [];

      // get the all messages on the conversation
      const messages = await this.messageRepository.queryMessagesByConversation(
        conversation[0].conversation.id
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
      chatLog.error("chat › unsent messages failed", { peerId, error });
      throw error;
    }
  }

  /**
   * Tries to resend a message to a peer by reconnecting and sending the message again.
   * @param message The message to resend
   * @param peerId The peer id
   * @param param2 The peer's ipAddress and port
   * @returns Promise<void>
   */
  async tryResendMessage(
    message: Message,
    peerId: string,
    { ipAddress, port }: { ipAddress: string; port: number }
  ): Promise<void> {
    try {
      await this.connectionService.connectToPeer(peerId, ipAddress, port);
      await this.connectionService.waitForDataChannel(peerId);

      this.connectionService.sendChatMessage(peerId, {
        message: message.content,
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
      });

      await this.messageStatusRepository.updateMessageStatusByMessage(
        message.id,
        MessageStatusType.SENT
      );
    } catch (error) {
      chatLog.error("chat › resend failed", {
        peerId,
        messageId: message.id,
        conversationId: message.conversation.id,
        error,
      });
      throw error;
    }
  }

  /**
   * Cleans up the chat service state, clearing peer and conversation references.
   */
  cleanUp(): void {
    this.peer = undefined;
    this.conversation = undefined;
    this.ackTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.ackTimeouts.clear();
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
