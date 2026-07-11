import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { decodeBase64 } from "tweetnacl-util";
import * as sapotTrust from "@/modules/sapot-trust";
import { getApiUrl, getWsUrl, getServerVerifyKey } from "@/config/runtime";
import {
  TcpServerAdapter,
  WsSignalingAdapter,
  ZeroconfAdapter,
} from "./connection/adapters";
import { database } from "./core/database";
import { GuestUserRepository } from "./peer";
import {
  ActiveUsersService,
  CallMediaService,
  CleanUpService,
  ConnectionService,
  DiscoveryService,
  NotificationService,
  SignalingService,
  WebrtcSessionManager,
} from "./connection/services";
import { LocalEncryptionService } from "./crypto/local-encryption-service";
import { PeerKeyService } from "./crypto/peer-key-service";
import { PeerKeyStore } from "./crypto/peer-key-store";
import { WsEncryptionContext } from "./crypto/ws-encryption";
import { KeyRecoveryService } from "./crypto/key-recovery-service";
import { AppModeStore, NetworkConfig } from "./core/stores";

import { CallService } from "@/features/call/services/call-service";
import { ConversationKeyManager } from "@/features/chat/services/conversation-key-manager";
import { ConversationKeyStore } from "@/features/chat/repositories/conversation-key-store";
import { ConversationParticipantRepository } from "@/features/chat/repositories/conversation-participant-repository";
import { ConversationRepository } from "@/features/chat/repositories/conversation-repository";
import { MessageRepository } from "@/features/chat/repositories/message-repository";
import { MessageStatusRepository } from "@/features/chat/repositories/message-status-repository";
import { ChatService } from "@/features/chat/services/chat-service";
import { MessageReceiptManager } from "@/features/chat/services/message-receipt-manager";
import { PublicChatService } from "@/features/chat/services/public-chat-service";
import { setAppAlive } from "@/task/signaling-task";
import { CertProvisioningService } from "@/features/settings/services/cert-provisioning-service";
import { AuthContainer } from "../auth/auth-container";
import { CallParticipantRepository } from "../call/repositories/call-participant-repository";
import { CallRepository } from "../call/repositories/call-repository";
import { SyncService } from "../sync";
import {
  getStoredAccessToken,
  saveConnectionConfig,
  saveUserProfile,
  getMigrationState,
  clearMigrationState,
} from "./core/stores/secure-config";
import { appLog } from "./core/utils/logger";

type KeysReady = { readonly _brand: "KeysReady" };
type MigrationOk = {
  readonly _brand: "MigrationOk";
  readonly migrationPushPending: boolean;
};

let _pendingRawPassword: string | null = null;
let _onResetRequested: (() => void) | null = null;

export function setPendingPassword(password: string): void {
  _pendingRawPassword = password;
}

export function setResetRequestedCallback(cb: () => void): void {
  _onResetRequested = cb;
}

export function requestMainContainerReset(): void {
  _onResetRequested?.();
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
  readonly conversationKeyStore: ConversationKeyStore;
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
  readonly conversationKeyManager: ConversationKeyManager;
  readonly certProvisioning: CertProvisioningService;

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
      userId: this.userContainer.userStore.isGuest
        ? null
        : this.userContainer.userStore.user.id,
    });
    this.peerKeyService = new PeerKeyService();
    this.peerKeyStore = new PeerKeyStore();
    this.keyRecoveryService = new KeyRecoveryService();
    this.certProvisioning = new CertProvisioningService({ trust: sapotTrust });
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
    // ConnectionService is wired last; services it depends on are injected via setters below.
    // Those setters store the object reference, not a bound function, so jest.spyOn replacements
    // on the injected instances are intercepted correctly in tests. See CLAUDE.md § Construction order.
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

    const notificationService = new NotificationService();

    this.connectionService = new ConnectionService(
      this.tcpServerAdapter,
      this.networkConfig,
      this.userContainer.userStore,
      this.appModeStore,
      this.wsSignalingAdapter,
      this.webrtcSessionManager,
      this.signalingService,
      this.callMediaService,
      notificationService,
      this.peerKeyService,
      this.peerKeyStore
    );

    this.conversationKeyStore = new ConversationKeyStore();
    this.messageRepository = new MessageRepository(database, this.conversationKeyStore);
    this.conversationRepository = new ConversationRepository(database);
    this.conversationParticipantRepository =
      new ConversationParticipantRepository(database);
    this.messageStatusRepository = new MessageStatusRepository(database);

    // Give GuestMigrationService access to MessageRepository so it can decrypt
    // message history before the auth ECDH keypair overwrites the conversation keys.
    this.userContainer.guestMigrationService.setMessageRepository(
      this.messageRepository
    );

    const messageReceiptManager = new MessageReceiptManager();

    this.syncService = new SyncService({
      db: database,
      messageReceiptManager,
      messageRepository: this.messageRepository,
      currentUserId: this.userContainer.userStore.user.id,
      peerService: this.userContainer.peerService,
      peerRepository: this.userContainer.peerRepository,
    });

    this.conversationKeyManager = new ConversationKeyManager(
      this.conversationKeyStore,
      this.peerKeyService,
      this.peerKeyStore,
      this.userContainer.userStore,
      this.conversationParticipantRepository,
    );

    this.chatService = new ChatService(
      this.connectionService,
      this.conversationRepository,
      this.conversationParticipantRepository,
      this.messageRepository,
      this.conversationKeyStore,
      this.messageStatusRepository,
      this.userContainer.peerService,
      this.userContainer.userStore,
      this.syncService,
      this.conversationKeyManager,
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
      this.syncService,
      this.messageRepository,
      this.messageStatusRepository,
      this.conversationKeyManager,
    );

    // Closure wiring: ConnectionService dispatches to these services through the live instance
    // reference, not a stored bound fn, so jest.spyOn replacements are intercepted in tests.
    // Do NOT refactor these to .bind() — that would capture the original method and bypass spies.
    this.connectionService.setChatService(this.chatService);
    this.connectionService.setCallService(this.callService);
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

  async initialize(): Promise<void> {
    try {
      if (this.initPromise) return this.initPromise;

      this.initPromise = (async () => {
        appLog.info("app › init start");
        const keysReady = await this.initializeKeys();
        const migOk = await this.handleMigration(keysReady);
        await this.startNetworkServices(migOk);
      })();

      return this.initPromise;
    } catch (error) {
      appLog.error("app › init failed", { error });
      throw error;
    }
  }

  private async initializeKeys(): Promise<KeysReady> {
    await this.localEncryptionService.initialize();
    _pendingRawPassword = null;

    if (!this.userContainer.userStore.isGuest) {
      const token = await getStoredAccessToken();
      if (token) {
        this._cachedAccessToken = token;
        const signalingKey = this.localEncryptionService.getSignalingSecretKey();
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
            storePeerKey: (peerId, ecdhPublicKeyB64) => {
              this.peerKeyStore.set(peerId, decodeBase64(ecdhPublicKeyB64));
            },
          };
          this.wsSignalingAdapter.setEncryptionContext(ctx);

          const masterKey = this.localEncryptionService.getMasterKeyBytes();

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

          const contactKeys = await this.peerKeyService.fetchAndDecryptContactKeys(
            masterKey,
            token,
            getApiUrl()
          );
          for (const [peerId, publicKey] of contactKeys) {
            if (!this.peerKeyStore.get(peerId)) {
              await this.peerKeyStore.restore(peerId, publicKey);
            }
          }

          const peerIds =
            (await this.userContainer.peerRepository.getAllPeerIds?.()) ?? [];
          await this.peerKeyStore.loadAll(peerIds);
          await this.conversationKeyManager.preloadAllConversationKeys();

          this.peerKeyStore.onKeySet((peerId) => {
            void this.conversationKeyManager.rederiveKeyForPeer(peerId).catch((err) =>
              appLog.warn("main › key rederive failed", { peerId, err })
            );
          });
        }
      }
    } else {
      await this.peerKeyService.initGuestKey();

      // Guests need the server verify key to check if a peer's credential is
      // genuine — without it they fall back to "credential present" only.
      await this.peerKeyService.loadServerVerifyKey();

      const guestPeerIds =
        (await this.userContainer.peerRepository.getAllPeerIds?.()) ?? [];
      await this.peerKeyStore.loadAll(guestPeerIds);
      await this.conversationKeyManager.preloadAllConversationKeys();

      this.peerKeyStore.onKeySet((peerId) => {
        void this.conversationKeyManager.rederiveKeyForPeer(peerId).catch((err) =>
          appLog.warn("main › key rederive failed", { peerId, err })
        );
      });
    }

    return { _brand: "KeysReady" };
  }

  private async handleMigration(_keys: KeysReady): Promise<MigrationOk> {
    let recoveryReEncryptDone = false;

    if (!this.userContainer.userStore.isGuest && this.peerKeyService.getMySecretKey()) {
      // Crash recovery: if a previous migration was interrupted (tokens saved
      // but re-encryption never completed), re-run the re-encryption pass now.
      // hasMigrationKeys() is always false on a fresh startup (in-memory only),
      // so we detect the incomplete state via the persisted SecureStore flag.
      const migrationState = await getMigrationState();
      if (migrationState === "in_progress" && !this.conversationKeyStore.hasMigrationKeys()) {
        appLog.info("app › migrate-recovery: incomplete migration detected, re-running re-encrypt");
        await this.messageRepository.reEncryptAfterMigration();
        await clearMigrationState();
        appLog.info("app › migrate-recovery: complete");
        recoveryReEncryptDone = true;
      }

      // Re-encrypt all messages with the new auth conversation keys if
      // we just completed a guest→auth migration.
      if (this.conversationKeyStore.hasMigrationKeys()) {
        appLog.info("app › running post-migration re-encryption pass");
        await this.messageRepository.reEncryptAfterMigration();
        appLog.info("app › post-migration re-encryption complete");
        // NOTE: migration keys are NOT cleared here. They are cleared by
        // syncService.syncNow() only after the first post-migration push.
      }

      // During the migration window: when a new auth conversation key becomes
      // available for a peer that connected late, retry re-encryption for any
      // plaintext messages in that conversation that were skipped earlier.
      this.conversationKeyStore.onConversationKeySet(async (conversationId: string) => {
        if (!this.conversationKeyStore.hasMigrationKeys()) return;
        await this.messageRepository.reEncryptConversation(conversationId);
      });
    }

    const migrationPushPending =
      recoveryReEncryptDone || this.conversationKeyStore.hasMigrationKeys();

    return { _brand: "MigrationOk", migrationPushPending };
  }

  private async startNetworkServices(migOk: MigrationOk): Promise<void> {
    const { migrationPushPending } = migOk;

    const effectiveMode = this.appModeStore.getEffectiveMode(
      this.userContainer.userStore.isGuest
    );

    if (effectiveMode === "lan") {
      // LAN mode normally never contacts the server. But logout wipes the local
      // DB and re-login restores history ONLY from the server, so a migration
      // performed purely in LAN mode would leave migrated messages unrecoverable
      // after a logout/login round-trip. Force a ONE-TIME server push here.
      if (migrationPushPending && !this.userContainer.userStore.isGuest) {
        try {
          appLog.info("app › LAN migration: forcing one-time server push");
          this.syncService.skipEncryptedMessageUpdatesOnNextSync();
          await this.syncService.syncNow();
          await this.conversationKeyManager.preloadAllConversationKeys();
          appLog.info("app › LAN migration: one-time server push complete");
        } catch (error) {
          appLog.warn("app › LAN migration: one-time server push failed", { error });
        }
      }
    } else {
      if (migrationPushPending) {
        this.syncService.skipEncryptedMessageUpdatesOnNextSync();
      }
      await this.syncService.syncNow();
      await this.conversationKeyManager.preloadAllConversationKeys();

      this.unsubscribeNetInfo = NetInfo.addEventListener(
        (state: NetInfoState) => {
          const isOnline =
            state.isConnected === true &&
            state.isInternetReachable !== false;
          void this.syncService.handleConnectivityChange(isOnline).catch((err) =>
            appLog.warn("main › connectivity change handler failed", { isOnline, err })
          );
        }
      );

      this.periodicSyncTimer = setInterval(() => {
        void this.syncService.syncNow().catch((err) =>
          appLog.warn("main › periodic sync failed", { err })
        );
      }, 5 * 60 * 1_000);
    }

    const { AppState } = require("react-native");
    let lastAppState = AppState.currentState;
    const appStateSub = AppState.addEventListener(
      "change",
      async (nextState: string) => {
        if (lastAppState === "background" && nextState === "active") {
          try {
            const peerIds =
              (await this.userContainer.peerRepository.getAllPeerIds?.()) ?? [];
            await this.peerKeyStore.loadAll(peerIds);
            await this.conversationKeyManager.preloadAllConversationKeys();
          } catch (error) {
            appLog.warn("app › key preload on foreground failed", { error });
          }
        }
        lastAppState = nextState;
      }
    );
    this.unsubscribeAppState = () => appStateSub.remove();

    await this.networkConfig.initialize();
    this.networkConfig.setOnIpChange(() => {
      void (async () => {
        try {
          if (this.appModeStore.isTcpAllowed(this.userContainer.userStore.isGuest)) {
            this.connectionService.stopTcpTransport();
            this.connectionService.start();
          }
          if (this.appModeStore.isZeroconfAllowed(this.userContainer.userStore.isGuest)) {
            await this.discoveryService.republish();
          }
        } catch (error) {
          appLog.error("app › ip change rebind failed", { error });
        }
      })();
    });
    this.networkConfig.startWatching();

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
  }

  /**
   * Resets the initialisation gate so the next `initialize()` call runs fully
   * for the newly authenticated user. Must be called during guest→auth migration
   * AFTER message history has been decrypted to plaintext, so the incoming auth
   * ECDH keypair doesn't corrupt the conversation keys.
   */
  resetForMigration(): void {
    appLog.info("app › resetForMigration: clearing initPromise for auth re-init");
    this.initPromise = undefined;
    // Clear in-memory conversation keys — they were derived from the guest ECDH
    // keypair. After resetForMigration the next initialize() derives new keys from
    // the auth ECDH keypair. Messages were already decrypted to plaintext before
    // this call, so clearing the keys cannot make anything unreadable.
    this.conversationKeyStore.clearConversationKeys();
    this.peerKeyStore.clear();
  }

  // Call on app destroy
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
