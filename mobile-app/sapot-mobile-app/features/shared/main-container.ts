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
  getMigrationState,
  clearMigrationState,
} from "./stores/secure-config";
import { appLog } from "./utils/logger";

let _pendingRawPassword: string | null = null;
let _pendingRawPIN: string | null = null;
let _onResetRequested: (() => void) | null = null;

export function setPendingPassword(password: string): void {
  _pendingRawPassword = password;
}

export function setPendingPIN(pin: string): void {
  _pendingRawPIN = pin;
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

    // Give GuestMigrationService access to MessageRepository so it can decrypt
    // message history before the auth ECDH keypair overwrites the conversation keys.
    this.userContainer.guestMigrationService.setMessageRepository(
      this.messageRepository
    );

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
    this.syncService.setMessageRepository(this.messageRepository);

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

        // Tracks whether the migration recovery re-encrypt ran so the
        // subsequent sync can protect locally re-encrypted messages.
        let recoveryReEncryptDone = false;

        // ── Auth ECDH key initialisation (moved before sync so re-encrypted
        //    content is what gets pushed in the first post-migration sync) ──
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
                (await this.userContainer.peerRepository.getAllPeerIds?.()) ??
                [];
              await this.peerKeyStore.loadAll(peerIds);
              await this.chatService.preloadAllConversationKeys();

              // Crash recovery: if a previous migration was interrupted (tokens saved
              // but re-encryption never completed), re-run the re-encryption pass now.
              // hasMigrationKeys() is always false on a fresh startup (in-memory only),
              // so we detect the incomplete state via the persisted SecureStore flag.
              const migrationState = await getMigrationState();
              if (migrationState === "in_progress" && !this.messageRepository.hasMigrationKeys()) {
                appLog.info("app › migrate-recovery: incomplete migration detected, re-running re-encrypt");
                await this.messageRepository.reEncryptAfterMigration();
                await clearMigrationState();
                appLog.info("app › migrate-recovery: complete");
                recoveryReEncryptDone = true;
              }

              // Re-encrypt all messages with the new auth conversation keys if
              // we just completed a guest→auth migration. This ensures the first
              // sync push sends K_AB′ ciphertext instead of plaintext or stale
              // K_AB ciphertext to the server.
              if (this.messageRepository.hasMigrationKeys()) {
                appLog.info("app › running post-migration re-encryption pass");
                await this.messageRepository.reEncryptAfterMigration();
                appLog.info("app › post-migration re-encryption complete");
                // NOTE: migration keys are NOT cleared here. They are cleared by
                // syncService.syncNow() only after the first post-migration push —
                // including the LAN-mode one-time forced push below — so the auth-key
                // ciphertext is durably stored server-side before the keys (and the
                // ability to decrypt the old guest ciphertext) are discarded.
              }

              this.peerKeyStore.onKeySet((peerId) => {
                void this.chatService.rederiveKeyForPeer(peerId);
              });

              // During the migration window: when a new auth conversation key becomes
              // available for a peer that connected late, retry re-encryption for any
              // plaintext messages in that conversation that were skipped earlier.
              this.messageRepository.onConversationKeySet(async (conversationId) => {
                if (!this.messageRepository.hasMigrationKeys()) return;
                await this.messageRepository.reEncryptConversation(conversationId);
              });
            }
          }
        }

        if (this.userContainer.userStore.isGuest) {
          await this.peerKeyService.initGuestKey();

          // Guests need the server verify key to check if a peer's credential is
          // genuine — without it they fall back to "credential present" only.
          // Use the compile-time env var if available; otherwise fetch & cache.
          await this.peerKeyService.loadServerVerifyKey();

          // Pre-load peer keys from SecureStore and derive conversation keys so
          // that messages are decryptable immediately on startup without waiting
          // for a new TCP handshake.
          const guestPeerIds =
            (await this.userContainer.peerRepository.getAllPeerIds?.()) ?? [];
          await this.peerKeyStore.loadAll(guestPeerIds);
          await this.chatService.preloadAllConversationKeys();

          this.peerKeyStore.onKeySet((peerId) => {
            void this.chatService.rederiveKeyForPeer(peerId);
          });
        }

        // ── Sync (runs after auth keys are loaded so re-encrypted messages
        //    are pushed on the first sync cycle) ──
        const effectiveMode = this.appModeStore.getEffectiveMode(
          this.userContainer.userStore.isGuest
        );
        // True when a guest→auth migration (or its crash recovery) just ran and the
        // auth-key ciphertext has not yet been pushed to the server.
        const migrationPushPending =
          recoveryReEncryptDone || this.messageRepository.hasMigrationKeys();

        if (effectiveMode === "lan") {
          // LAN mode normally never contacts the server. But logout wipes the local
          // DB and re-login restores history ONLY from the server, so a migration
          // performed purely in LAN mode would leave migrated messages unrecoverable
          // (or unreadable as stale guest ciphertext) after a logout/login round-trip.
          // Force a ONE-TIME server push here so the auth-key ciphertext is durably
          // stored server-side. We do NOT install the periodic/NetInfo sync below,
          // so LAN mode returns to offline-only operation after this single push.
          // (Reachable only for non-guest users — this whole branch is inside the
          //  `!isGuest` block above; guests have no server account to push to.)
          if (migrationPushPending && !this.userContainer.userStore.isGuest) {
            try {
              appLog.info("app › LAN migration: forcing one-time server push");
              // Protect the locally re-encrypted messages from being overwritten by
              // the pull phase's stale guest-key ciphertext before the push lands.
              this.syncService.skipEncryptedMessageUpdatesOnNextSync();
              await this.syncService.syncNow();
              await this.chatService.preloadAllConversationKeys();
              appLog.info("app › LAN migration: one-time server push complete");
            } catch (error) {
              // Non-fatal: keys/state stay set so the crash-recovery path retries
              // the push on the next startup once the server is reachable.
              appLog.warn("app › LAN migration: one-time server push failed", { error });
            }
          }
        } else {
          // Normal and recovery migration paths: the pull phase must not overwrite
          // locally re-encrypted messages with the server's older guest-key
          // ciphertext before the push sends the auth-key version. The pull
          // clearing the dirty flag prevents the push from ever reaching the
          // server, so subsequent syncs keep restoring the old ciphertext and
          // decryption fails permanently once migration keys are cleared.
          if (migrationPushPending) {
            this.syncService.skipEncryptedMessageUpdatesOnNextSync();
          }
          await this.syncService.syncNow();
          // Re-derive conversation keys after sync so that conversations pulled
          // from the server on first login have their keys ready before rendering.
          await this.chatService.preloadAllConversationKeys();

          this.unsubscribeNetInfo = NetInfo.addEventListener(
            (state: NetInfoState) => {
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
        // On a local IP change, rebind the TCP server to the new interface and
        // re-advertise over mDNS so peers stop dialing the dead old address.
        this.networkConfig.setOnIpChange(() => {
          void (async () => {
            try {
              if (this.appModeStore.isTcpAllowed(this.userContainer.userStore.isGuest)) {
                this.connectionService.stopTcpTransport();
                this.connectionService.start();
              }
              if (
                this.appModeStore.isZeroconfAllowed(
                  this.userContainer.userStore.isGuest
                )
              ) {
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
      })();

      return this.initPromise;
    } catch (error) {
      appLog.error("app › init failed", { error });
      throw error;
    }
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
    this.messageRepository.clearConversationKeys();
    this.peerKeyStore.clear();
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
