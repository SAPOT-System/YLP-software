import {
  ConversationParticipantRepository,
  ConversationRepository,
  MessageRepository,
  MessageStatusRepository,
} from "@/features/chat";
import { GuestUserRepository, PeerRepository } from "../repositories";
import { database } from "../database";

export class CleanUpService {
  constructor(
    private guestUserRepository: GuestUserRepository,
    private peerRepository: PeerRepository,
    private messageRepository: MessageRepository,
    private messageStatusRepository: MessageStatusRepository,
    private conversationRepository: ConversationRepository,
    private conversationParticipantRepository: ConversationParticipantRepository
  ) {}

  async cleanUp() {
    await database.write(async () => {
      const convOps =
        await this.conversationRepository.getConversationDestroyOps();
      const msgOps = await this.messageRepository.getAllMessageDestroyOps();
      const statusOps =
        await this.messageStatusRepository.getStatusDestroyOps();
      const partOps =
        await this.conversationParticipantRepository.getParticipantDestroyOps();
      const peerOps = await this.peerRepository.getPeerDestroyOps();
      const guestUserOps =
        await this.guestUserRepository.getGuestUserDestroyOps();
      await database.batch(
        ...convOps,
        ...msgOps,
        ...statusOps,
        ...partOps,
        ...peerOps,
        ...guestUserOps
      );
    });
  }
}
