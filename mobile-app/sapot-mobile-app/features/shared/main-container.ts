import { getWsUrl } from "@/config/runtime";
import {
    TcpServerAdapter,
    WsSignalingAdapter,
    ZeroconfAdapter,
} from "./adapters";
import { database } from "./database";
import { GuestUserRepository } from "./repositories";
import {
    CallMediaService,
    CleanUpService,
    ConnectionService,
    DiscoveryService,
    SignalingService,
    WebrtcSessionManager,
} from "./services";
import { AppModeStore, NetworkConfig } from "./stores";

import { CallService } from "@/features/call/services/call-service";
import { ConversationParticipantRepository } from "@/features/chat/repositories/conversation-participant-repository";
import { ConversationRepository } from "@/features/chat/repositories/conversation-repository";
import { MessageRepository } from "@/features/chat/repositories/message-repository";
import { MessageStatusRepository } from "@/features/chat/repositories/message-status-repository";
import { ChatService } from "@/features/chat/services/chat-service";
import { AuthContainer } from "../auth/auth-container";
import { SyncService } from "../sync";
import baseLogger from "./utils/logger";

const appLog = baseLogger.extend("app");

/**
 * AppContainer is responsible for initializing and wiring up all core services, repositories, and stores for the mobile app.
 * It acts as a dependency injection container and provides a single point of initialization for the application.
 */
export class MainContainer {
  readonly zeroconfAdapter: ZeroconfAdapter;
  readonly networkConfig: NetworkConfig;
  readonly discoveryService: DiscoveryService;
  readonly tcpServerAdapter: TcpServerAdapter;
  readonly webrtcSessionManager: WebrtcSessionManager;
  readonly signalingService: SignalingService;
  readonly callMediaService: CallMediaService;
  readonly connectionService: ConnectionService;
  readonly chatService: ChatService;
  readonly messageRepository: MessageRepository;
  readonly conversationRepository: ConversationRepository;
  readonly conversationParticipantRepository: ConversationParticipantRepository;
  readonly messageStatusRepository: MessageStatusRepository;
  readonly callService: CallService;
  readonly guestUserRepository: GuestUserRepository;
  readonly userContainer: AuthContainer;
  readonly cleanUpService: CleanUpService;
  readonly appModeStore: AppModeStore;
  readonly syncService: SyncService;
  readonly wsSignalingAdapter: WsSignalingAdapter;

  private initPromise?: Promise<void>;

  /**
   * Constructs an AppContainer instance and initializes all dependencies and services.
   * Sets up dependency injection and cross-service references.
   */
  constructor(userContainer: AuthContainer, appModeStore: AppModeStore) {
    this.userContainer = userContainer;
    this.appModeStore = appModeStore;

    this.networkConfig = new NetworkConfig();

    this.messageRepository = new MessageRepository(database);
    this.messageStatusRepository = new MessageStatusRepository(database);
    this.zeroconfAdapter = new ZeroconfAdapter();
    this.discoveryService = new DiscoveryService(
      this.zeroconfAdapter,
      this.userContainer.sessionStore,
      this.networkConfig,
      this.userContainer.userStore,
      this.userContainer.peerService,
      this.appModeStore
    );

    this.wsSignalingAdapter = new WsSignalingAdapter();
    this.tcpServerAdapter = new TcpServerAdapter();

    // Construction order: WebrtcSessionManager → SignalingService → CallMediaService → ConnectionService
    this.webrtcSessionManager = new WebrtcSessionManager(
      this.userContainer.userStore,
      this.networkConfig
    );

    this.signalingService = new SignalingService(
      this.webrtcSessionManager.getWebrtcAdapter.bind(this.webrtcSessionManager),
      this.wsSignalingAdapter,
      getWsUrl(),
      this.userContainer.userStore,
      this.networkConfig,
      this.appModeStore
    );

    this.callMediaService = new CallMediaService(
      this.webrtcSessionManager.getWebrtcAdapter.bind(this.webrtcSessionManager)
    );

    this.connectionService = new ConnectionService(
      this.tcpServerAdapter,
      this.networkConfig,
      this.userContainer.userStore,
      this.appModeStore,
      this.wsSignalingAdapter,
      this.webrtcSessionManager,
      this.signalingService,
      this.callMediaService
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
      this.userContainer.peerService,
      this.userContainer.userStore
    );

    this.callService = new CallService(
      this.connectionService,
      this.userContainer.userStore
    );

    this.connectionService.setChatService(this.chatService);
    this.discoveryService.setChatService(this.chatService);
    this.discoveryService.setConnectionService(this.connectionService);

    this.guestUserRepository = new GuestUserRepository(database);

    this.syncService = new SyncService({
      peerService: userContainer.peerService,
      db: database,
    });

    // Clean up
    this.cleanUpService = new CleanUpService(
      this.guestUserRepository,
      this.userContainer.peerRepository,
      this.messageRepository,
      this.messageStatusRepository,
      this.conversationRepository,
      this.conversationParticipantRepository
    );
    this.userContainer.userService.setCleanUpService(this.cleanUpService);
  }

  /**
   * Initializes the application by initializing the user service and network configuration.
   * Ensures initialization is only performed once (idempotent).
   * @returns Promise<void>
   */
  async initialize() {
    try {
      if (this.initPromise) return this.initPromise;

      this.initPromise = (async () => {
        appLog.info("app › init start");
        await this.networkConfig.initialize();
        this.networkConfig.startWatching();
      })();

      return this.initPromise;
    } catch (error) {
      appLog.error("app › init failed", { error });
      throw error;
    }
  }
}
