import { TcpServerAdapter, ZeroconfAdapter } from "./adapters";
import { database } from "./database";
import { PeerRepository } from "./repositories";
import {
  ConnectionService,
  DiscoveryService,
  PeerService,
  UserService,
} from "./services";
import { NetworkConfig, SessionStore, UserStore } from "./stores";

import { CallService } from "@/features/call/services/call-service";
import { ConversationParticipantRepository } from "@/features/chat/repositories/conversation-participant-repository";
import { ConversationRepository } from "@/features/chat/repositories/conversation-repository";
import { MessageRepository } from "@/features/chat/repositories/message-repository";
import { MessageStatusRepository } from "@/features/chat/repositories/message-status-repository";
import { ChatService } from "@/features/chat/services/chat-service";

/**
 * AppContainer is responsible for initializing and wiring up all core services, repositories, and stores for the mobile app.
 * It acts as a dependency injection container and provides a single point of initialization for the application.
 */
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

  /**
   * Constructs an AppContainer instance and initializes all dependencies and services.
   * Sets up dependency injection and cross-service references.
   */
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

    this.callService = new CallService(this.connectionService, this.userStore);

    this.connectionService.setChatService(this.chatService);
    this.discoveryService.setChatService(this.chatService);
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
          console.log("Initializing...");
          await this.userService.initialize();
          await this.networkConfig.initialize();
      })();

      return this.initPromise;
    } catch (error) {
      console.error(
        "[AppContainer]: Error initializing the application:",
        error
      );
      throw error;
    }
  }
}
