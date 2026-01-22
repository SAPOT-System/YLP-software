import {
  Conversation,
  ConversationParticipantRole,
  ConversationType,
  database,
  Message,
  MessageStatusType,
  Peer,
  UserStore,
} from "@/features/shared";
import {
  ConversationParticipantRepository,
  ConversationRepository,
  MessageRepository,
  MessageStatusRepository,
} from "../repositories/";
import { ConnectionService } from "./connection-service";
import { PeerService } from "./peer-service";
import { SentMessageI } from "../types";

// This is class will be responsible of behavior and rules of the conversation.
export class ChatService {
  private peer?: Peer;
  private conversation?: Conversation;
  constructor(
    private connectionService: ConnectionService,
    private conversationRepository: ConversationRepository,
    private conversationParticipantRepository: ConversationParticipantRepository,
    private messageRepository: MessageRepository,
    private messageStatusRepository: MessageStatusRepository,
    private peerService: PeerService,
    private userStore: UserStore
  ) {}

  async connect(id: string) {
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
      console.warn("[ChatService]: Error connecting to peer:", error);
    }
  }

  disconnect() {
    this.connectionService.disconnect();
    this.conversation = undefined;
    this.peer = undefined;
  }

  // TODO: Apply ACID principle and retry if failed
  async handleIncomingChatMessage(data: SentMessageI) {
    try {
      // Check if the direct conversation state between current user and peer is created
      console.log("[ChatService]: Handling incoming chat message");
      const isConversationExist =
        await this.conversationRepository.isConversationExist(
          data.conversationId
        );

      console.log("[ChatService]: Conversation exist", isConversationExist);
      // TODO: inform user if peer state is not initialize

      const sender = await this.peerService.findPeerById(data.senderId);

      // TODO: create sender if not exists in the database

      console.log("[ChatService]: Sender:", sender.id);

      // Initialize the conversation
      let conversation: Conversation;
      if (!isConversationExist)
        conversation = await this.createChatRoom(sender, data.conversationId);
      else
        conversation = await this.conversationRepository.queryConversationById(
          data.conversationId
        );

      console.log("[ChatService]: Conversation:", conversation.id);
      // Create message without taking the message status
      await this.messageRepository.saveMessage({
        sender: sender,
        content: data.message,
        conversation: conversation,
      });

      console.log("[ChatService]: Message ID:", data.messageId);

      // Send acknowledge
      this.connectionService.sendAckMessage(sender.id, {
        messageId: data.messageId,
      });
    } catch (error) {
      console.error(
        "[ChatService]: Error handling incoming chat message:",
        error
      );
    }
  }

  async handleAckMessage(messageId: string) {
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
        "[ChatService]: Error handling acknowledge message:",
        error
      );
    }
  }

  // TODO: make a transaction on this function to follow ACID principle
  // TODO: make a logic where user can send conversation even if the receiver is not online. Store the sent conversation and wait for receiver to be online.
  // This method will use the current class state about peer and conversation
  async sendChatMessage(message: string) {
    try {
      if (!this.peer) throw new Error("No peer state stored");

      // Make sure conversation property is initialized
      if (!this.conversation) {
        // Check if the direct conversation state between current user and peer is created
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

      // Create the message and message status
      const { newMessage, newMessageStatus } = await this.createMessage({
        sender: this.userStore.user,
        message: message,
        conversation: this.conversation,
      });

      try {
        this.connectionService.sendChatMessage(this.peer.id, {
          message: message,
          conversationId: this.conversation.id,
          messageId: newMessage.id,
          senderId: newMessage.sender.id,
          sentAt: newMessage.createdAt,
          messageType: newMessage.messageType,
        });
        // Update into sent
        await this.messageStatusRepository.updateMessageStatusById(
          newMessageStatus.id,
          MessageStatusType.SENT
        );
      } catch (error) {
        await this.messageStatusRepository.updateMessageStatusById(
          newMessageStatus.id,
          MessageStatusType.NOT_SENT
        );
      }

      return this.conversation.id;
    } catch (error) {
      console.error("[ChatService]: Error sending conversation message", error);
      throw error;
    }
  }

  // TODO: Apply transaction
  private async createMessage({
    sender,
    message,
    conversation,
  }: {
    sender: Peer;
    message: string;
    conversation: Conversation;
  }) {
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
      console.error("[ChatService]: Error creating message", error);
      throw error;
    }
  }

  private async createChatRoom(peer: Peer, conversationId?: string) {
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
          ConversationParticipantRole.MEMBER,
          true
        );
        return conversation;
      });
    } catch (error) {
      console.error("[ChatService]: Error creating chat room", error);
      throw error;
    }
  }

  // TODO: Determine if the conversation is direct or group conversation for integrating group conversation soon
  // For now, I assume that we don't have group conversationt
  // This is used by conversation room when the source is conversation list.
  async findPeerIdByChatId(chatId: string) {
    const participants =
      await this.conversationParticipantRepository.queryPeerByChatId(
        chatId,
        this.userStore.user.id
      );
    return participants[0].user.id;
  }

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
      console.warn("[ChatService]: Error finding chat by peer:", error);
    }
  }

  async getAllConversations() {
    return await this.conversationRepository.queryAllConversation();
  }

  async getMessagesFromConversation(conversationId: string) {
    return await this.messageRepository.queryMessagesByConversation(
      conversationId
    );
  }

  async getMessageStatus(messageId: string) {
    return await this.messageStatusRepository.queryMessageStatusByMessage(
      messageId
    );
  }

  async getAllParticipants() {
    console.log(
      await this.conversationParticipantRepository.queryAllParticipants()
    );
  }

  async getAllStatus() {
    console.log(await this.messageStatusRepository.queryAllStatuses());
  }

  async getAllNotSentMessageForPeer(peerId: string) {
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
      console.error("[ChatService]: Error getting unsent messages:", error);
      throw error;
    }
  }

  async tryResendMessage(
    message: Message,
    peerId: string,
    { ipAddress, port }: { ipAddress: string; port: number }
  ) {
    try {
      await this.connectionService.connectToPeer(peerId, ipAddress, port);

      this.connectionService.sendChatMessage(peerId, {
        message: message.content,
        conversationId: message.conversation.id,
        messageId: message.id,
        senderId: message.sender.id,
        sentAt: message.createdAt,
        messageType: message.messageType,
      });

      await this.messageStatusRepository.updateMessageStatusByMessage(
        message.id,
        MessageStatusType.SENT
      );
    } catch (error) {
      console.warn("[ChatService]: Resending message failed");
      throw error;
    }
  }

  cleanUp() {
    this.peer = undefined;
    this.conversation = undefined;
  }

  // This is for debugging purposes
  async deleteAllConversations() {
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
