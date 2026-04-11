import {
    ConversationParticipantRepository,
    ConversationRepository,
    MessageRepository,
    MessageStatusRepository,
} from "@/features/chat";
import { database } from "../database";
import { GuestUserRepository, PeerRepository } from "../repositories";
import baseLogger from "../utils/logger";

const cleanUpLog = baseLogger.extend("cleanup");

cleanUpLog.debug("[clean-up-service] module loaded");

export class CleanUpService {
  constructor(
    private guestUserRepository: GuestUserRepository,
    private peerRepository: PeerRepository,
    private messageRepository: MessageRepository,
    private messageStatusRepository: MessageStatusRepository,
    private conversationRepository: ConversationRepository,
    private conversationParticipantRepository: ConversationParticipantRepository
  ) {
    cleanUpLog.info("cleanup › service constructed", {
      hasGuestUserRepository: Boolean(guestUserRepository),
      hasPeerRepository: Boolean(peerRepository),
      hasMessageRepository: Boolean(messageRepository),
      hasMessageStatusRepository: Boolean(messageStatusRepository),
      hasConversationRepository: Boolean(conversationRepository),
      hasConversationParticipantRepository: Boolean(conversationParticipantRepository),
    });
  }

  async cleanUp() {
    try {
      cleanUpLog.info("cleanup › start");
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
      cleanUpLog.info("cleanup › complete");
    } catch (error) {
      cleanUpLog.error("cleanup › failed", { error });
      throw error;
    }
  }
}
