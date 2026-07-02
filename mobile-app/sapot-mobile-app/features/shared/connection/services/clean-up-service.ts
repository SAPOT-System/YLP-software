import {
  ConversationParticipantRepository,
  ConversationRepository,
  MessageRepository,
  MessageStatusRepository,
} from "@/features/chat";
import { toAppError, captureAppError } from "@/features/shared/core/errors";
import { database } from "../../core/database";
import { GuestUserRepository, PeerRepository } from "../../peer";
import { cleanUpLog } from "../../core/utils/logger";
import { ConnectionService } from "./connection-service";
import { DiscoveryService } from "./discovery-service";

cleanUpLog.debug("[clean-up-service] module loaded");

export class CleanUpService {
  constructor(
    private guestUserRepository: GuestUserRepository,
    private peerRepository: PeerRepository,
    private messageRepository: MessageRepository,
    private messageStatusRepository: MessageStatusRepository,
    private conversationRepository: ConversationRepository,
    private conversationParticipantRepository: ConversationParticipantRepository,
    private connectionService: ConnectionService,
    private discoveryService: DiscoveryService
  ) {
    cleanUpLog.info("cleanup › service constructed", {
      hasGuestUserRepository: Boolean(guestUserRepository),
      hasPeerRepository: Boolean(peerRepository),
      hasMessageRepository: Boolean(messageRepository),
      hasMessageStatusRepository: Boolean(messageStatusRepository),
      hasConversationRepository: Boolean(conversationRepository),
      hasConversationParticipantRepository: Boolean(
        conversationParticipantRepository
      ),
      hasConnectionService: Boolean(connectionService),
      hasDiscoveryService: Boolean(discoveryService),
    });
  }

  private async wipeAllTables() {
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

  async cleanUp() {
    try {
      cleanUpLog.info("cleanup › start");
      await this.wipeAllTables();
      this.discoveryService.destroy();
      this.connectionService.stop();
      cleanUpLog.info("cleanup › complete");
    } catch (error) {
      const appErr = toAppError(error, "database");
      cleanUpLog.error("cleanup › failed", appErr);
      captureAppError(appErr);
      throw appErr;
    }
  }

  /** Wipes all database tables without stopping services. Used before relogin
   *  so MainContainer.cleanup() (triggered immediately after) stops services
   *  exactly once. */
  async wipeDataOnly() {
    try {
      cleanUpLog.info("cleanup › wipeDataOnly start");
      await this.wipeAllTables();
      cleanUpLog.info("cleanup › wipeDataOnly complete");
    } catch (error) {
      const appErr = toAppError(error, "database");
      cleanUpLog.error("cleanup › wipeDataOnly failed", appErr);
      captureAppError(appErr);
      throw appErr;
    }
  }
}
