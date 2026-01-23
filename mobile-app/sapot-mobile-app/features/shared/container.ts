import { database } from "./database";
import { NetworkConfig, SessionStore, UserStore } from "./stores";
import { TcpServerAdapter, ZeroconfAdapter } from "./adapters";
import {
  ConnectionService,
  DiscoveryService,
  PeerService,
  UserService,
} from "./services";
import { CallService } from "@/features/call";
import {
  ChatService,
  ConversationParticipantRepository,
  ConversationRepository,
  MessageRepository,
  MessageStatusRepository,
} from "@/features/chat";
import { PeerRepository } from "./repositories";

// This class will be used for initializing mobile app by initializing classes.
export class AppContainer {
  readonly zeroconfAdapter: ZeroconfAdapter;
  readonly sessionStore: SessionStore;
  readonly networkConfig: NetworkConfig;
  readonly userStore: UserStore;
  readonly discoveryService: DiscoveryService;
  readonly userService: UserService;
  readonly tcpServerAdapter: TcpServerAdapter;
  readonly connectionService: ConnectionService;
  readonly chatService: ChatService;
  readonly peerService: PeerService;
  readonly peerRepository: PeerRepository;
  readonly messageRepository: MessageRepository;
  readonly conversationRepository: ConversationRepository;
  readonly conversationParticipantRepository: ConversationParticipantRepository;
  readonly messageStatusRepository: MessageStatusRepository;
  readonly callService: CallService;

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
    this.connectionService = new ConnectionService(
      this.tcpServerAdapter,
      this.networkConfig,
      this.userStore
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

    this.callService = new CallService(
      this.connectionService,
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
