import {
  database,
  NetworkConfig,
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

import {
  DiscoveryService,
  ConnectionService,
  ChatService,
  PeerService,
} from "./services";

import {
  ConversationParticipantRepository,
  ConversationRepository,
  MessageRepository,
  MessageStatusRepository,
  PeerRepository,
} from "./repositories";

// This class will be used for initializing mobile app by initializing classes.
export class AppContainer {
  readonly zeroconfAdapter: ZeroconfAdapter;
  readonly sessionStore: SessionStore;
  readonly networkConfig: NetworkConfig;
  readonly userStore: UserStore;
  readonly discoveryService: DiscoveryService;
  readonly userService: UserService;
  readonly tcpClientAdapter: TcpClientAdapter;
  readonly tcpServerAdapter: TcpServerAdapter;
  readonly connectionService: ConnectionService;
  readonly chatService: ChatService;
  readonly webrtcAdapter: WebrtcAdapter;
  readonly peerService: PeerService;
  readonly peerRepository: PeerRepository;
  readonly messageRepository: MessageRepository;
  readonly conversationRepository: ConversationRepository;
  readonly conversationParticipantRepository: ConversationParticipantRepository;
  readonly messageStatusRepository: MessageStatusRepository;

  private initPromise?: Promise<void>;

  constructor() {
    this.sessionStore = new SessionStore();
    this.networkConfig = new NetworkConfig();

    this.peerRepository = new PeerRepository(database);
    this.peerService = new PeerService(this.peerRepository);

    this.userStore = new UserStore();
    this.userService = new UserService(
      this.userStore,
      this.peerService,
      this.sessionStore
    );

    this.messageRepository = new MessageRepository(database);
    this.messageStatusRepository = new MessageStatusRepository(database);
    this.zeroconfAdapter = new ZeroconfAdapter();
    this.discoveryService = new DiscoveryService(
      this.zeroconfAdapter,
      this.sessionStore,
      this.networkConfig,
      this.userStore,
      this.peerService
    );

    this.tcpServerAdapter = new TcpServerAdapter();
    this.webrtcAdapter = new WebrtcAdapter();
    this.tcpClientAdapter = new TcpClientAdapter();
    this.connectionService = new ConnectionService(
      this.tcpClientAdapter,
      this.tcpServerAdapter,
      this.networkConfig,
      this.userStore,
    );

    this.messageRepository = new MessageRepository(database);
    this.conversationRepository = new ConversationRepository(database);
    this.conversationParticipantRepository =
      new ConversationParticipantRepository(database);
    this.messageStatusRepository = new MessageStatusRepository(database);
    this.chatService = new ChatService(
      this.connectionService,
      this.conversationRepository,
      this.conversationParticipantRepository,
      this.messageRepository,
      this.messageStatusRepository,
      this.peerService,
      this.userStore
    );

    this.connectionService.setChatService(this.chatService);
    this.discoveryService.setChatService(this.chatService);
  }

  async initialize() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      console.log("Initializing...");
      await this.userService.initialize();
      await this.networkConfig.initialize();
    })();

    return this.initPromise;
  }
}
