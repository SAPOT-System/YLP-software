import {
  database,
  NetworkConfig,
  SessionService,
  PeerDatabaseService,
  SessionStore,
  UserService,
  UserStore,
} from "../shared";

import { ZeroconfAdapter } from "./adapter/zeroconf-adapter";
import { DiscoveryService } from "./services/discovery-service";

export class AppContainer {
  readonly zeroconfAdapter: ZeroconfAdapter;
  readonly sessionStore: SessionStore;
  readonly networkConfig: NetworkConfig;
  readonly userStore: UserStore;
  readonly sessionService: SessionService;
  readonly peerDatabaseService: PeerDatabaseService;
  readonly discoveryService: DiscoveryService;
  readonly userService: UserService;

  private initPromise?: Promise<void>;

  constructor() {
    this.sessionStore = new SessionStore();
    this.sessionService = new SessionService(this.sessionStore);

    this.networkConfig = new NetworkConfig();

    this.userStore = new UserStore();
    this.userService = new UserService(this.userStore);

    this.peerDatabaseService = new PeerDatabaseService(database);
    this.zeroconfAdapter = new ZeroconfAdapter();
    this.discoveryService = new DiscoveryService(
      this.zeroconfAdapter,
      this.peerDatabaseService,
      this.sessionStore,
      this.networkConfig,
      this.userStore
    );
  }

  async initialize() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      await this.sessionService.initialize();
      await this.userService.initialize();
    })();

    return this.initPromise;
  }
}
