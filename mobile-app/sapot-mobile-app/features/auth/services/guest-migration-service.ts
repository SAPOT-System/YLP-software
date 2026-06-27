import { MessageRepository } from "@/features/chat/repositories";
import { GuestUserRepository } from "@/features/shared/peer";
import { setMigrationState } from "@/features/shared/core/stores/secure-config";
import { toAppError, captureAppError } from "@/features/shared/core/errors";
import { authLog } from "@/features/shared/core/utils/logger";

authLog.debug("[guest-migration-service] module loaded");

export class GuestMigrationService {
  constructor(
    private guestUserRepository: GuestUserRepository,
    private messageRepository?: MessageRepository
  ) {
    authLog.info("guest-migration › service constructed");
  }

  /**
   * Wired by MainContainer after it constructs MessageRepository, since
   * AuthContainer (which owns GuestMigrationService) is built before MainContainer.
   */
  setMessageRepository(repo: MessageRepository): void {
    this.messageRepository = repo;
  }

  /**
   * Wired by MainContainerProvider after the container is initialised.
   * Called at the end of `migrateAndCleanUp()` so the MainContainer can clear
   * its `initPromise` and run a fresh initialisation for the auth session.
   */
  private onMigrationComplete?: () => void;
  setOnMigrationComplete(cb: () => void): void {
    this.onMigrationComplete = cb;
  }

  /**
   * Migrates the guest session to an authenticated one:
   *
   * 1. Decrypts all `ecdh:`-prefixed messages to plaintext using the guest-session
   *    conversation keys that are currently live in `MessageRepository`. This MUST
   *    happen before the `MainContainer` re-initialises with the auth ECDH keypair,
   *    because the auth-derived conversation keys are different and would make the
   *    old ciphertext permanently unreadable.
   *
   * 2. Deletes the `guest_user` table record so the identity is fully transferred
   *    to the new `peers` row that the server created during registration.
   *
   * Call `mainContainer.resetForMigration()` after this returns so the next
   * `initialize()` run sets up the auth ECDH keypair and re-derives conversation
   * keys from it.
   */
  async migrateAndCleanUp(): Promise<void> {
    try {
      authLog.info("guest-migration › migrate start");

      // Step 1 — decrypt history while guest keys are still live in memory
      if (this.messageRepository) {
        authLog.info("guest-migration › decrypting messages to plaintext");
        await this.messageRepository.decryptAllMessagesToPlaintext();
        authLog.info("guest-migration › message decryption complete");

        // Mark migration in progress ONLY after local history is plaintext. The
        // crash-recovery path holds the auth keypair (the guest keys are gone after
        // restart) and re-encrypts whatever plaintext it finds — so the persisted
        // flag must imply "messages are already plaintext, awaiting auth re-encrypt".
        // Setting it earlier would let a crash before this point strand still-guest-
        // encrypted messages that recovery cannot decrypt.
        await setMigrationState("in_progress");
        authLog.info("guest-migration › state: in_progress");

        // Step 1b — capture the guest conversation keys before they are cleared
        // by resetForMigration(). These keys will be used in SyncService to decrypt
        // server-stored ciphertext during the first post-migration sync pull.
        if (this.messageRepository) {
          this.messageRepository.captureGuestKeysForMigration();
          authLog.info("guest-migration › guest conversation keys captured for re-encryption");
        }
      } else {
        authLog.warn("guest-migration › messageRepository not provided — message history may be unreadable after migration");
      }

      // Step 2 — remove the guest_user row; the server already created a peers row
      // with the same UUID so all FK-like string references (sender, conversation
      // participants) continue to resolve correctly.
      await this.guestUserRepository.deleteAllGuestUser();

      // Step 3 — signal MainContainer to reset so the next initialize() call runs
      // fresh for the auth session (registers auth ECDH key, sets up WS encryption,
      // preloads conversation keys under the auth keypair).
      this.onMigrationComplete?.();

      authLog.info("guest-migration › migrate complete");
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("guest-migration › migrate failed", appErr);
      captureAppError(appErr);
      throw appErr;
    }
  }

  /** @deprecated Use migrateAndCleanUp() which also preserves message history. */
  async cleanUp(): Promise<void> {
    return this.migrateAndCleanUp();
  }
}
