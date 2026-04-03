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
import {
  ConversationParticipantRepository,
  ConversationRepository,
  MessageRepository,
  MessageStatusRepository,
} from "../repositories";
import { DataChatMessageI } from "../types";

/**
 * ChatService is responsible for managing chat/conversation logic, including peer connections, message sending/receiving,
 * repository coordination, and state management. It encapsulates business rules for chat flows and ensures ACID principles where possible.
 */
export class ChatService {
  private peer?: Peer;
  private conversation?: Conversation;
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
  ) {}

  /**
   * Connects to a peer by id, establishing a network connection for chat.
   * @param id The peer id to connect to
   * @returns Promise<void>
   */
  async connect(id: string): Promise<void> {
    try {
      const foundUser = await this.peerService.findPeerById(id);
      if (!foundUser) throw new Error("Peer not found");
      this.peer = foundUser;

      const discoveredPeer = this.peerService.findDiscoveredPeerById(id);

      if (!discoveredPeer) throw new Error("Peer not discovered");

      await this.connectionService.connectToPeer(
        discoveredPeer.id,
        discoveredPeer.ipAddress,
        discoveredPeer.port
      );
    } catch (error) {
      console.warn(
        `[ChatService]: Error connecting to peer id of ${id}: ${error}`
      );
      throw error;
    }
  }

  /**
   * Disconnects the current chat session, clearing peer and conversation state.
   */
  disconnect(): void {
    try {
      this.conversation = undefined;
      this.peer = undefined;
    } catch (error) {
      console.error(`[ChatService]: Error disconneting chat service: ${error}`);
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
      console.log("[ChatService]: Handling incoming chat message");
      const sender = await this.peerService.findPeerById(data.from);
      // TODO: create sender if not exists in the database
      const conversation = await this.getOrCreateConversationForIncoming(
        sender,
        data.conversationId
      );
      await this.saveIncomingMessage(sender, conversation, data);
      this.acknowledgeIncomingMessage(sender.id, data.messageId);
    } catch (error) {
      console.error(
        `[ChatService]: Error handling incoming chat message of:\n${JSON.stringify(
          data,
          null,
          2
        )}\n${error}`
      );
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
    console.log("[ChatService]: Conversation exist", isConversationExist);
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
    console.log("[ChatService]: Sender:", sender.id);
    console.log("[ChatService]: Conversation:", conversation.id);
    // TODO: save message with the received incoming message ID
    await this.messageRepository.saveMessage({
      sender: sender,
      content: data.message,
      conversation: conversation,
    });
    console.log("[ChatService]: Message ID:", data.messageId);
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
   * Handles an incoming acknowledgment message for a given messageId, updating its status to DELIVERED.
   * @param messageId The message id to acknowledge
   * @returns Promise<void>
   */
  async handleAckMessage(messageId: string): Promise<void> {
    try {
      console.log(
        `[ChatService]: Handling acknowledge message with a message id of ${messageId}...`
      );

      await this.messageStatusRepository.updateMessageStatusByMessage(
        messageId,
        MessageStatusType.DELIVERED
      );
    } catch (error) {
      console.error(
        `[ChatService]: Error handling acknowledge message for message id of ${messageId}: ${error}`
      );
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
      return this.conversation!.id;
    } catch (error) {
      console.error(
        `[ChatService]: Error sending chat message "${message}": ${error}`
      );
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
      this.connectionService.sendChatMessage(this.peer!.id, {
        message: message,
        conversationId: this.conversation!.id,
        messageId: newMessage.id,
        to: this.peer!.id,
        from: this.userStore.user.id,
        sentAt: newMessage.createdAt,
        messageType: newMessage.messageType,
      });
      await this.messageStatusRepository.updateMessageStatusById(
        newMessageStatus.id,
        MessageStatusType.SENT
      );
    } catch {
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
      console.error(
        `[ChatService]: Error sending creating message of "${message}" with the sender of ${sender.username} and conversation ID of ${conversation.id}: ${error}`
      );
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
      console.error(
        `[ChatService]: Error sending creating chat room of "${peer.username}" with the conversation ID of ${conversationId}: ${error}`
      );
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
      console.error(
        `[ChatService]: Error finding peer ID by chat ID of ${chatId}: ${error}`
      );
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
      console.error(
        `[ChatService]: Error finding chat ID by peer ID of ${peerId}: ${error}`
      );
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
      console.error("[ChatService]: Error getting all conversation:", error);
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
      console.error(
        `[ChatService]: Error getting messages from conversation with the conversation ID of ${conversationId}: ${error}`
      );
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
      console.error(
        `[ChatService]: Error getting message status with the message ID of ${messageId}: ${error}`
      );
      throw error;
    }
  }

  /**
   * Gets all participants in all conversations (for debugging/logging).
   * @returns Promise<void>
   */
  async getAllParticipants(): Promise<void> {
    try {
      console.log(
        await this.conversationParticipantRepository.queryAllParticipants()
      );
    } catch (error) {
      console.error(`[ChatService]: Error getting all participants: ${error}`);
      throw error;
    }
  }

  /**
   * Gets all message statuses (for debugging/logging).
   * @returns Promise<void>
   */
  async getAllStatus(): Promise<void> {
    try {
      console.log(await this.messageStatusRepository.queryAllStatuses());
    } catch (error) {
      console.error(`[ChatService]: Error getting all status: ${error}`);
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
      console.log(messageIds.length);

      const unsentStatuses =
        await this.messageStatusRepository.queryNotSentByMessages(messageIds);

      const unsentStatusesIds: string[] = unsentStatuses.map(
        (u) => u.message.id
      );

      if (!unsentStatusesIds) return [];
      console.log(
        "[ChatService]: unsent messages",
        unsentStatusesIds.length - 1
      );

      return messages.filter((m) => unsentStatusesIds.includes(m.id));
    } catch (error) {
      console.error(
        `[ChatService]: Error getting all not sent message for peer ${peerId}: ${error}`
      );
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

      this.connectionService.sendChatMessage(peerId, {
        message: message.content,
        conversationId: message.conversation.id,
        messageId: message.id,
        from: message.sender.id,
        to: peerId,
        sentAt: message.createdAt,
        messageType: message.messageType,
      });

      await this.messageStatusRepository.updateMessageStatusByMessage(
        message.id,
        MessageStatusType.SENT
      );
    } catch (error) {
      console.error(
        `[ChatService]: Error trying to resend message\nMessage:\n${JSON.stringify(
          message,
          null,
          2
        )}\nIP Address: ${ipAddress}\nPort: ${port}\n${peerId}: ${error}`
      );
      throw error;
    }
  }

  /**
   * Cleans up the chat service state, clearing peer and conversation references.
   */
  cleanUp(): void {
    this.peer = undefined;
    this.conversation = undefined;
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
