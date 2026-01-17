import {
  database,
  NetworkConfig,
  SessionService,
  PeerDatabaseService,
  SessionStore,
  UserService,
  UserStore,
} from "../shared";

import {
  ZeroconfAdapter,
  TcpClientAdapter,
  TcpServerAdapter,
  WebrtcAdapter,
} from "./adapter";
import { DiscoveryService, ConnectionService, ChatService } from "./services";
import { MessageService } from "./services/message-service";
import { PeerRepository } from "./services/peer-repository";
import { PeerService } from "./services/peer-service";

export class AppContainer {
  readonly zeroconfAdapter: ZeroconfAdapter;
  readonly sessionStore: SessionStore;
  readonly networkConfig: NetworkConfig;
  readonly userStore: UserStore;
  readonly sessionService: SessionService;
  readonly peerDatabaseService: PeerDatabaseService;
  readonly discoveryService: DiscoveryService;
  readonly userService: UserService;
  readonly tcpClientAdapter: TcpClientAdapter;
  readonly tcpServerAdapter: TcpServerAdapter;
  readonly connectionService: ConnectionService;
  readonly chatService: ChatService;
  readonly messageService: MessageService;
  readonly webrtcAdapter: WebrtcAdapter;
  readonly peerService: PeerService;
  readonly peerRepository: PeerRepository;

  private initPromise?: Promise<void>;

  constructor() {
    this.sessionStore = new SessionStore();
    this.sessionService = new SessionService(this.sessionStore);

    this.networkConfig = new NetworkConfig();

    this.userStore = new UserStore();
    this.userService = new UserService(this.userStore);

    this.peerDatabaseService = new PeerDatabaseService(database);
    this.zeroconfAdapter = new ZeroconfAdapter();
    this.peerRepository = new PeerRepository(database);
    this.peerService = new PeerService(this.peerRepository);
    this.discoveryService = new DiscoveryService(
      this.zeroconfAdapter,
      this.sessionStore,
      this.networkConfig,
      this.userStore,
      this.peerService
    );

    this.webrtcAdapter = new WebrtcAdapter();
    this.tcpClientAdapter = new TcpClientAdapter();
    this.connectionService = new ConnectionService(
      this.tcpClientAdapter,
      this.peerDatabaseService,
      this.webrtcAdapter,
      this.networkConfig
    );
    this.chatService = new ChatService(this.connectionService);

    this.tcpServerAdapter = new TcpServerAdapter();
    this.messageService = new MessageService(
      this.tcpServerAdapter,
      this.networkConfig,
      this.connectionService
    );
  }

  async initialize() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      console.log("Initializing...");
      await this.sessionService.initialize();
      await this.userService.initialize();
    })();

    return this.initPromise;
  }
}
