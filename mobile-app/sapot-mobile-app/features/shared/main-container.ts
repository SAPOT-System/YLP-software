import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { decodeBase64 } from "tweetnacl-util";
import { getApiUrl, getWsUrl, getServerVerifyKey } from "@/config/runtime";
import {
  TcpServerAdapter,
  WsSignalingAdapter,
  ZeroconfAdapter,
} from "./adapters";
import { database } from "./database";
import { GuestUserRepository } from "./repositories";
import {
  ActiveUsersService,
  CallMediaService,
  CleanUpService,
  ConnectionService,
  DiscoveryService,
  SignalingService,
  WebrtcSessionManager,
} from "./services";
import { LocalEncryptionService } from "./services/local-encryption-service";
import { PeerKeyService } from "./services/peer-key-service";
import { PeerKeyStore } from "./services/peer-key-store";
import { WsEncryptionContext } from "./services/ws-encryption";
import { KeyRecoveryService } from "./services/key-recovery-service";
import { AppModeStore, NetworkConfig } from "./stores";

import { CallService } from "@/features/call/services/call-service";
import { ConversationParticipantRepository } from "@/features/chat/repositories/conversation-participant-repository";
import { ConversationRepository } from "@/features/chat/repositories/conversation-repository";
import { MessageRepository } from "@/features/chat/repositories/message-repository";
import { MessageStatusRepository } from "@/features/chat/repositories/message-status-repository";
import { ChatService } from "@/features/chat/services/chat-service";
import { PublicChatService } from "@/features/chat/services/public-chat-service";
import { setAppAlive } from "@/task/signaling-task";
import { AuthContainer } from "../auth/auth-container";
import { CallParticipantRepository } from "../call/repositories/call-participant-repository";
import { CallRepository } from "../call/repositories/call-repository";
import { SyncService } from "../sync";
import {
  getStoredAccessToken,
  saveConnectionConfig,
  saveUserProfile,
} from "./stores/secure-config";
import { appLog } from "./utils/logger";

let _pendingRawPassword: string | null = null;
let _pendingRawPIN: string | null = null;

export function setPendingPassword(password: string): void {
  _pendingRawPassword = password;
}

export function setPendingPIN(pin: string): void {
  _pendingRawPIN = pin;
}

appLog.debug("[main-container] module loaded");

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
  readonly callRepository: CallRepository;
  readonly callParticipantRepository: CallParticipantRepository;
  readonly callService: CallService;
  readonly guestUserRepository: GuestUserRepository;
  readonly userContainer: AuthContainer;
  readonly cleanUpService: CleanUpService;
  readonly appModeStore: AppModeStore;
  readonly syncService: SyncService;
  readonly wsSignalingAdapter: WsSignalingAdapter;
  readonly publicChatService: PublicChatService;
  readonly activeUsersService: ActiveUsersService;
  readonly localEncryptionService: LocalEncryptionService;
  readonly peerKeyService: PeerKeyService;
  readonly peerKeyStore: PeerKeyStore;
  readonly keyRecoveryService: KeyRecoveryService;

  private initPromise?: Promise<void>;
  private unsubscribeNetInfo?: () => void;
  private periodicSyncTimer?: ReturnType<typeof setInterval>;
  private unsubscribeAppState?: () => void;
  private _cachedAccessToken?: string;

  /**
   * Constructs an AppContainer instance and initializes all dependencies and services.
   * Sets up dependency injection and cross-service references.
   */
  constructor(userContainer: AuthContainer, appModeStore: AppModeStore) {
    appLog.info("app › container constructed", {
      hasUserContainer: Boolean(userContainer),
      hasAppModeStore: Boolean(appModeStore),
    });
    this.userContainer = userContainer;
    this.appModeStore = appModeStore;

    this.networkConfig = new NetworkConfig();

    this.localEncryptionService = new LocalEncryptionService({
      getPassword: () => _pendingRawPassword,
      getPIN: () => _pendingRawPIN ?? "",
      userId: this.userContainer.userStore.isGuest
        ? null
        : this.userContainer.userStore.user.id,
    });
    this.peerKeyService = new PeerKeyService();
    this.peerKeyStore = new PeerKeyStore();
    this.keyRecoveryService = new KeyRecoveryService();
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
    this.activeUsersService = new ActiveUsersService(this.wsSignalingAdapter);
    this.tcpServerAdapter = new TcpServerAdapter(
      this.peerKeyService,
      this.peerKeyStore
    );

    // Construction order: WebrtcSessionManager → SignalingService → CallMediaService → ConnectionService
    this.webrtcSessionManager = new WebrtcSessionManager(
      this.userContainer.userStore,
      this.networkConfig
    );

    this.signalingService = new SignalingService(
      this.webrtcSessionManager.getWebrtcAdapter.bind(
        this.webrtcSessionManager
      ),
      this.wsSignalingAdapter,
      getWsUrl(),
      this.userContainer.userStore,
      this.networkConfig,
      this.appModeStore,
      this.peerKeyService,
      this.peerKeyStore,
      getApiUrl(),
      () => this._cachedAccessToken
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
      this.callMediaService,
      this.peerKeyService,
      this.peerKeyStore
    );

    this.messageRepository = new MessageRepository(database);
    this.conversationRepository = new ConversationRepository(database);
    this.conversationParticipantRepository =
      new ConversationParticipantRepository(database);
    this.messageStatusRepository = new MessageStatusRepository(database);

    this.syncService = new SyncService({
      db: database,
      currentUserId: this.userContainer.userStore.user.id,
      peerService: this.userContainer.peerService,
      peerRepository: this.userContainer.peerRepository,
    });

    this.chatService = new ChatService(
      this.connectionService,
      this.conversationRepository,
      this.conversationParticipantRepository,
      this.messageRepository,
      this.messageStatusRepository,
      this.userContainer.peerService,
      this.userContainer.userStore,
      this.syncService,
      this.peerKeyService,
      this.peerKeyStore
    );

    // Inject messageReceiptManager into SyncService after ChatService construction
    this.syncService.setMessageReceiptManager(
      this.chatService.getMessageReceiptManager()
    );

    this.publicChatService = new PublicChatService(
      this.userContainer.userStore,
      this.wsSignalingAdapter,
      this.appModeStore
    );

    this.callRepository = new CallRepository(database);
    this.callParticipantRepository = new CallParticipantRepository(database);
    this.callService = new CallService(
      this.connectionService,
      this.userContainer.userStore,
      this.userContainer.peerService,
      this.callRepository,
      this.callParticipantRepository,
      this.chatService,
      this.syncService
    );

    this.connectionService.setChatService(this.chatService);
    this.connectionService.setPeerService(this.userContainer.peerService);
    this.discoveryService.setChatService(this.chatService);
    this.discoveryService.setConnectionService(this.connectionService);

    this.guestUserRepository = new GuestUserRepository(database);

    // Clean up
    this.cleanUpService = new CleanUpService(
      this.guestUserRepository,
      this.userContainer.peerRepository,
      this.messageRepository,
      this.messageStatusRepository,
      this.conversationRepository,
      this.conversationParticipantRepository,
      this.connectionService,
      this.discoveryService
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
        await this.localEncryptionService.initialize();
        _pendingRawPassword = null;
        _pendingRawPIN = null;

        if (
          this.appModeStore.getEffectiveMode(
            this.userContainer.userStore.isGuest
          ) !== "lan"
        ) {
          await this.syncService.syncNow();

          this.unsubscribeNetInfo = NetInfo.addEventListener(
            (state: NetInfoState) => {
              // isInternetReachable can be null on Android during transitions; treat null as online
              const isOnline =
                state.isConnected === true &&
                state.isInternetReachable !== false;
              void this.syncService.handleConnectivityChange(isOnline);
            }
          );

          this.periodicSyncTimer = setInterval(() => {
            void this.syncService.syncNow();
          }, 5 * 60 * 1_000);
        }

        if (this.userContainer.userStore.isGuest) {
          // Guest users cannot reach the server for key registration, so we
          // generate (or load) a local Curve25519 keypair. The public key is
          // exchanged with peers directly during the TCP handshake, enabling
          // application-layer message encryption without any server round-trip.
          await this.peerKeyService.initGuestKey();

          // Guest peers also need conversation keys re-derived when a remote
          // peer's appPub arrives via TCP handshake.
          this.peerKeyStore.onKeySet((peerId) => {
            void this.chatService.rederiveKeyForPeer(peerId);
          });
        }

        if (!this.userContainer.userStore.isGuest) {
          const token = await getStoredAccessToken();
          if (token) {
            this._cachedAccessToken = token;
            const signalingKey =
              this.localEncryptionService.getSignalingSecretKey();
            await this.peerKeyService.initFromSecretKey(
              signalingKey,
              getApiUrl(),
              token,
              this.userContainer.userStore.user.id
            );

            const serverVerifyKeyB64 = getServerVerifyKey();
            if (serverVerifyKeyB64) {
              this.peerKeyService.setServerVerifyKey(
                Buffer.from(serverVerifyKeyB64, "base64")
              );
            }

            const mySecretKey = this.peerKeyService.getMySecretKey();
            if (mySecretKey) {
              const ctx: WsEncryptionContext = {
                mySecretKey,
                getPeerPublicKey: (peerId) => this.peerKeyStore.get(peerId),
                // Called by the WS adapter when a plaintext credential arrives
                // alongside an encrypted message — stores the sender's key so
                // decryption can proceed immediately on the same message.
                storePeerKey: (peerId, ecdhPublicKeyB64) => {
                  this.peerKeyStore.set(peerId, decodeBase64(ecdhPublicKeyB64));
                },
              };
              this.wsSignalingAdapter.setEncryptionContext(ctx);

              const masterKey = this.localEncryptionService.getMasterKeyBytes();

              // Wire the uploader: whenever peerKeyStore receives a new appPub from
              // a TCP handshake (including from guest peers who are not server-registered),
              // encrypt it under the auth user's master key and back it up to the server.
              // This is the only way conversation keys survive a new-device login.
              this.peerKeyStore.setContactKeyUploader(
                async (peerId, publicKey) => {
                  const currentToken = this._cachedAccessToken;
                  if (!currentToken) return;
                  await this.peerKeyService.uploadContactKey(
                    peerId,
                    publicKey,
                    masterKey,
                    currentToken,
                    getApiUrl()
                  );
                }
              );

              // Restore any contact keys backed up from previous sessions (including
              // guest peer keys not available via /keys/{peerId}). Must run before
              // preloadAllConversationKeys so conversation keys are derived correctly.
              const contactKeys = await this.peerKeyService.fetchAndDecryptContactKeys(
                masterKey,
                token,
                getApiUrl()
              );
              for (const [peerId, publicKey] of contactKeys) {
                // restore() writes to SecureStore and fires onKeySet listeners
                // but deliberately skips the contactKeyUploader to prevent
                // re-uploading keys we just downloaded.
                if (!this.peerKeyStore.get(peerId)) {
                  await this.peerKeyStore.restore(peerId, publicKey);
                }
              }

              // Pre-load all peer ECDH keys from SecureStore, then pre-derive
              // conversation keys so the chat list shows decrypted previews immediately.
              const peerIds =
                (await this.userContainer.peerRepository.getAllPeerIds?.()) ??
                [];
              await this.peerKeyStore.loadAll(peerIds);
              void this.chatService.preloadAllConversationKeys();

              // When a TCP handshake delivers a guest peer's appPub (guests cannot
              // register with the server), re-derive their conversation key immediately
              // so any already-loaded messages are decrypted without a screen reload.
              this.peerKeyStore.onKeySet((peerId) => {
                void this.chatService.rederiveKeyForPeer(peerId);
              });
            }
          }
        }

        // Restore peer keys from SecureStore when app comes back to foreground
        const { AppState } = require("react-native");
        let lastAppState = AppState.currentState;
        const appStateSub = AppState.addEventListener(
          "change",
          async (nextState: string) => {
            if (lastAppState === "background" && nextState === "active") {
              try {
                const peerIds =
                  (await this.userContainer.peerRepository.getAllPeerIds?.()) ??
                  [];
                await this.peerKeyStore.loadAll(peerIds);
                void this.chatService.preloadAllConversationKeys();
              } catch {
                // non-fatal — keys will be re-exchanged on next signaling message
              }
            }
            lastAppState = nextState;
          }
        );
        this.unsubscribeAppState = () => appStateSub.remove();

        await this.networkConfig.initialize();
        this.networkConfig.startWatching();

        // Persist peerId and wsUrl for background task
        await saveConnectionConfig({
          peerId: this.userContainer.userStore.user.id ?? "unknown",
          wsUrl: getWsUrl(),
        });
        await saveUserProfile({
          username: this.userContainer.userStore.user.username,
          firstName: this.userContainer.userStore.user.firstName,
          lastName: this.userContainer.userStore.user.lastName || undefined,
        });

        setAppAlive(true);
      })();

      return this.initPromise;
    } catch (error) {
      appLog.error("app › init failed", { error });
      throw error;
    }
  }

  // Call on logout or app destroy
  async cleanup() {
    try {
      appLog.info("app › cleanup start");

      // Release the lock — background task takes over transport ownership
      setAppAlive(false);

      this.networkConfig.stopWatching();

      this.unsubscribeNetInfo?.();
      this.unsubscribeNetInfo = undefined;

      this.unsubscribeAppState?.();
      this.unsubscribeAppState = undefined;

      if (this.periodicSyncTimer) {
        clearInterval(this.periodicSyncTimer);
        this.periodicSyncTimer = undefined;
      }

      this.syncService.cleanup();

      this.connectionService.stop(); // stops TCP + WS + WebRTC
      await this.discoveryService.destroy(); // stops Zeroconf (await cleanup)

      this.peerKeyStore.clear();

      this.initPromise = undefined;

      appLog.info("app › cleanup complete");
    } catch (error) {
      appLog.error("app › cleanup failed", { error });
      throw error;
    }
  }
}
