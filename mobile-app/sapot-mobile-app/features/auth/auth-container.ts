import { toAppError, captureAppError } from "../shared/core/errors";
import { database } from "../shared/core/database/database";
import { GuestUserRepository } from "../shared/peer/guest-user-repository";
import { PeerRepository } from "../shared/peer/peer-repository";
import { PeerService } from "../shared/peer/peer-service";
import { UserService } from "../shared/connection/services/user-service";
import { SessionStore } from "../shared/core/stores/session-store";
import { UserStore } from "../shared/core/stores/user-store";
import { authLog } from "../shared/core/utils/logger";
import { GuestMigrationService } from "./services/guest-migration-service";
import { PhoneVerificationService } from "./services/phone-verification-service";

authLog.debug("[auth-container] module loaded");

export class AuthContainer {
  readonly userService: UserService;
  readonly peerService: PeerService;
  readonly peerRepository: PeerRepository;
  readonly guestUserRepository: GuestUserRepository;
  readonly guestMigrationService: GuestMigrationService;
  readonly phoneVerificationService: PhoneVerificationService;
  readonly userStore: UserStore;
  readonly sessionStore: SessionStore;
  private initPromise?: Promise<void>;

  constructor() {
    authLog.debug("[AuthContainer] constructor");
    this.sessionStore = new SessionStore();
    this.peerRepository = new PeerRepository(database);
    this.peerService = new PeerService(this.peerRepository);

    this.userStore = new UserStore();

    this.guestUserRepository = new GuestUserRepository(database);
    this.guestMigrationService = new GuestMigrationService(
      this.guestUserRepository
    );
    this.phoneVerificationService = new PhoneVerificationService();

    this.userService = new UserService(
      this.userStore,
      this.peerService,
      this.sessionStore,
      this.guestUserRepository
    );
  }

  async initialize() {
    try {
      if (this.initPromise) return this.initPromise;

      this.initPromise = (async () => {
        authLog.info("auth › container initializing");
        // await this.userService.initialize();
      })();

      return this.initPromise;
    } catch (error) {
      const appErr = toAppError(error, "auth");
      captureAppError(appErr);
      authLog.error("auth › container init failed", appErr);
      throw appErr;
    }
  }
}
