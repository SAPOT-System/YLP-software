import {
  database,
  GuestUserRepository,
  PeerRepository,
  PeerService,
  SessionStore,
  UserService,
  UserStore,
} from "../shared";

export class AuthContainer {
  readonly userService: UserService;
  readonly peerService: PeerService;
  readonly peerRepository: PeerRepository;
  readonly guestUserRepository: GuestUserRepository;
  readonly userStore: UserStore;
  readonly sessionStore: SessionStore;
  private initPromise?: Promise<void>;

  constructor() {
    this.sessionStore = new SessionStore();
    this.peerRepository = new PeerRepository(database);
    this.peerService = new PeerService(this.peerRepository);

    this.userStore = new UserStore();

    this.guestUserRepository = new GuestUserRepository(database);

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
        console.log("User container Initializing...");
        // await this.userService.initialize();
      })();

      return this.initPromise;
    } catch (error) {
      console.error("[Container]: Error initializing the application:", error);
      throw error;
    }
  }
}
