import { Peer, SessionStore, Status } from "@/features/shared";
import { ConnectionService } from "./connection-service";
import { MessageRepository } from "./message-repository";
import { PeerService } from "./peer-service";
import { ChatRepository } from "./chat-repository";
import { ParticipantRepository } from "./participant-repository";
import { ChatType, ParticipantRole } from "@/features/shared";

// This is class will be responsible of behavior and rules of the conversation/chat.
export class ChatService {
  private peer?: Peer;
  private chatId?: string;
  constructor(
    private connectionService: ConnectionService,
    private chatRepository: ChatRepository,
    private participantRepository: ParticipantRepository,
    private messageRepository: MessageRepository,
    private peerService: PeerService,
    private sessionStore: SessionStore
  ) {}

  async connect(id: string) {
    this.peer = await this.peerService.findPeerById(id);

    await this.connectionService.connectToPeer(
      this.peer.ipAddress,
      this.peer.port
    );
  }

  disconnect() {
    this.connectionService.disconnect();
    this.chatId = undefined;
  }

  async sendChatMessage(message: string) {
    try {
      if (!this.connectionService.isConnected)
        throw new Error("Not connected to peer");

      if (!this.peer) throw new Error("No peer state stored");

      if (!this.chatId) {
        // Check if the chat state is created
        this.chatId = await this.participantRepository.isDirectChatExists([
          this.peer.id,
          this.sessionStore.userId,
        ]);

        if (!this.chatId) {
          // Create chat
          const { id } = await this.chatRepository.createRepository({
            type: ChatType.DIRECT,
          });
          await this.participantRepository.addMultiple(
            [this.peer.id, this.sessionStore.userId],
            id
          );
          this.chatId = id;
        }
      }

      this.connectionService.sendChatMessage(message);

      this.messageRepository.saveMessage({
        senderId: this.peer.id,
        message: message,
        status: Status.SENT,
        chatId: this.chatId,
      });
    } catch (error) {
      console.error("[ChatService]: Error sending chat message");
    }
  }
}
