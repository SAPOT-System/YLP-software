import {
  Peer,
  MessageStatus,
  database,
  UserStore,
  ChatType,
  ParticipantRole,
  Chat,
} from "@/features/shared";
import { ConnectionService } from "./connection-service";
import { MessageRepository } from "./message-repository";
import { PeerService } from "./peer-service";
import { ChatRepository } from "./chat-repository";
import { ParticipantRepository } from "./participant-repository";

// This is class will be responsible of behavior and rules of the conversation/chat.
export class ChatService {
  private peer?: Peer;
  private chat?: Chat;
  constructor(
    private connectionService: ConnectionService,
    private chatRepository: ChatRepository,
    private participantRepository: ParticipantRepository,
    private messageRepository: MessageRepository,
    private peerService: PeerService,
    private userStore: UserStore
  ) {}

  async connect(id: string) {
    try {
      const discoveredPeer = this.peerService.findDiscoveredPeerById(id);

      if (!discoveredPeer) throw new Error("Peer not discovered");

      const foundUser = await this.peerService.findPeerById(id);
      if (foundUser.length <= 0) throw new Error("Peer not found");
      this.peer = foundUser[0];

      await this.connectionService.connectToPeer(
        discoveredPeer.ipAddress,
        discoveredPeer.port
      );
    } catch (error) {
      console.error("[ChatService]: Error connecting to peer:", error);
    }
  }

  disconnect() {
    this.connectionService.disconnect();
    this.chat = undefined;
    this.peer = undefined;
  }

  // TODO: make a transaction on this function to follow ACID principle
  // TODO: make a logic where user can send chat even if the receiver is not online. Store the sent chat and wait for receiver to be online. 
  async sendChatMessage(message: string) {
    try {
      if (!this.connectionService.isConnected)
        throw new Error("Not connected to peer");

      if (!this.peer) throw new Error("No peer state stored");

      // Make sure chat property is initialized
      if (!this.chat) {
        // Check if the direct chat state between current user and peer is created
        const chatId = await this.participantRepository.isDirectChatExists([
          this.peer.id,
          this.userStore.user.id,
        ]);
          
        if (!chatId) {
          this.chat = await this.createChatRoom()
        } else {
          this.chat = await this.chatRepository.findChatById(chatId);
        }
      }

      this.connectionService.sendChatMessage(message);

      this.messageRepository.saveMessage({
        sender: this.peer,
        message: message,
        status: MessageStatus.SENT,
        chat: this.chat,
      });
    } catch (error) {
      console.error("[ChatService]: Error sending chat message", error);
    }
  }

  private async createChatRoom() {
    // Wrap into write method to ensure ACID for safety transaction
    return await database.write(async () => {
      const chat = await this.chatRepository.createRepository(
        {
          type: ChatType.DIRECT,
        },
        true
      );
      await this.participantRepository.addMultiple(
        [this.peer!, this.userStore.user],
        chat,
        ParticipantRole.MEMBER,
        true
      );
      return chat;
    });
  }

  // TODO: Determine if the chat is direct or group chat for integrating group chat soon
  // For now, I assume that we don't have group chat
  // This is used by chat room when the source is chat list.
  async findPeerIdByChatId(chatId: string) {
    const participants = await this.participantRepository.getPeerByChatId(
      chatId,
      this.userStore.user.id
    );
    return participants[0].peer.id;
  }

  async initializePeerByChatId(chatId: string) {
    this.chat = await this.chatRepository.findChatById(chatId);
  }

  async getAllPeers() {
    return await this.chatRepository.queryAllChats();
  }
}
