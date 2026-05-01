import { GuestUserRepository } from "@/features/shared/repositories";
import { authLog } from "@/features/shared/utils/logger";

authLog.debug("[guest-migration-service] module loaded");

export class GuestMigrationService {
  constructor(private guestUserRepository: GuestUserRepository) {
    authLog.info("guest-migration › service constructed");
  }

  async cleanUp(): Promise<void> {
    try {
      authLog.info("guest-migration › cleanup start");
      await this.guestUserRepository.deleteAllGuestUser();
      authLog.info("guest-migration › cleanup complete");
    } catch (error) {
      authLog.error("guest-migration › cleanup failed", { error });
      throw error;
    }
  }
}
