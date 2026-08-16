/* eslint-disable @typescript-eslint/no-explicit-any */
import { MainContainer, setPendingPassword } from "../main-container";
import { AuthContainer } from "@/features/auth/auth-container";
import { AppModeStore } from "../core/stores";
import { KeyInitError } from "../core/errors";

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("@/config/runtime", () => ({
  getApiUrl: jest.fn(() => "http://localhost:8000"),
  getWsUrl: jest.fn(() => "ws://localhost:8000"),
  getServerVerifyKey: jest.fn(() => null),
}));

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));

jest.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock("tweetnacl-util", () => ({
  decodeBase64: jest.fn(() => new Uint8Array(32)),
}));

jest.mock("../core/stores/secure-config", () => ({
  getStoredAccessToken: jest.fn().mockResolvedValue(null),
  getMigrationState: jest.fn().mockResolvedValue(null),
  clearMigrationState: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../crypto/local-encryption-service", () => ({
  LocalEncryptionService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    getSignalingSecretKey: jest.fn().mockReturnValue(new Uint8Array(32)),
    getMasterKeyBytes: jest.fn().mockReturnValue(new Uint8Array(32)),
  })),
}));

jest.mock("../crypto/peer-key-service", () => ({
  PeerKeyService: jest.fn().mockImplementation(() => ({
    initFromSecretKey: jest.fn().mockResolvedValue(undefined),
    initGuestKey: jest.fn().mockResolvedValue(undefined),
    loadServerVerifyKey: jest.fn().mockResolvedValue(undefined),
    setServerVerifyKey: jest.fn(),
    getMySecretKey: jest.fn().mockReturnValue(null),
    fetchAndDecryptContactKeys: jest.fn().mockResolvedValue([]),
    uploadContactKey: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../crypto/peer-key-store", () => ({
  PeerKeyStore: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    restore: jest.fn().mockResolvedValue(undefined),
    loadAll: jest.fn().mockResolvedValue(undefined),
    setContactKeyUploader: jest.fn(),
    onKeySet: jest.fn(),
    clear: jest.fn(),
  })),
}));

jest.mock("../crypto/key-recovery-service", () => ({
  KeyRecoveryService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("../crypto/ws-encryption", () => ({}));

jest.mock("../connection/services", () => ({
  ActiveUsersService: jest.fn().mockImplementation(() => ({})),
  CallMediaService: jest.fn().mockImplementation(() => ({
    getWebrtcAdapter: jest.fn(),
  })),
  CleanUpService: jest.fn().mockImplementation(() => ({})),
  NotificationService: jest.fn().mockImplementation(() => ({
    showCallAlert: jest.fn().mockResolvedValue(undefined),
    dismissCallAlert: jest.fn().mockResolvedValue(undefined),
  })),
  ConnectionService: jest.fn().mockImplementation(() => ({
    setChatService: jest.fn(),
    setCallService: jest.fn(),
    setPeerService: jest.fn(),
    stopTcpTransport: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    on: jest.fn(),
  })),
  DiscoveryService: jest.fn().mockImplementation(() => ({
    setChatService: jest.fn(),
    setConnectionService: jest.fn(),
    republish: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
  })),
  GsmService: jest.fn().mockImplementation(() => ({})),
  SignalingService: jest.fn().mockImplementation(() => ({})),
  WebrtcSessionManager: jest.fn().mockImplementation(() => ({
    getWebrtcAdapter: jest.fn(),
  })),
}));

jest.mock("../connection/adapters", () => ({
  TcpServerAdapter: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
  WsSignalingAdapter: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    sendMessage: jest.fn(),
    setEncryptionContext: jest.fn(),
    resetTransportForNetworkChange: jest.fn(),
    disconnect: jest.fn(),
    connect: jest.fn(),
  })),
  ZeroconfAdapter: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    startScan: jest.fn(),
    stopScan: jest.fn(),
    publishService: jest.fn(),
    cleanUp: jest.fn(),
  })),
}));

jest.mock("../core/stores", () => ({
  AppModeStore: jest.fn(),
  NetworkConfig: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    setOnIpChange: jest.fn(),
    setOnNetworkRegained: jest.fn(),
    startWatching: jest.fn(),
    stopWatching: jest.fn(),
    port: 8080,
    ipAddress: "192.168.1.1",
  })),
}));

jest.mock("../peer", () => ({
  GuestUserRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@/features/chat/repositories/conversation-key-store", () => ({
  ConversationKeyStore: jest.fn().mockImplementation(() => ({
    hasMigrationKeys: jest.fn().mockReturnValue(false),
    onConversationKeySet: jest.fn().mockReturnValue(jest.fn()),
    clearConversationKeys: jest.fn(),
    clear: jest.fn(),
  })),
}));

jest.mock("@/features/chat/repositories/message-repository", () => ({
  MessageRepository: jest.fn().mockImplementation(() => ({
    reEncryptAfterMigration: jest.fn().mockResolvedValue(undefined),
    reEncryptConversation: jest.fn().mockResolvedValue(undefined),
    decryptMessage: jest.fn((m: { content: string }) => m.content),
  })),
}));

jest.mock("@/features/chat/repositories/conversation-repository", () => ({
  ConversationRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@/features/chat/repositories/conversation-participant-repository", () => ({
  ConversationParticipantRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@/features/chat/repositories/message-status-repository", () => ({
  MessageStatusRepository: jest.fn().mockImplementation(() => ({
    queryNotSentByMessages: jest.fn(),
    updateMessageStatusById: jest.fn(),
    updateMessageStatusByMessage: jest.fn(),
    updateToNotSentIfStillPendingById: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("@/features/chat/services/conversation-key-manager", () => ({
  ConversationKeyManager: jest.fn().mockImplementation(() => ({
    preloadAllConversationKeys: jest.fn().mockResolvedValue(undefined),
    rederiveKeyForPeer: jest.fn().mockResolvedValue(undefined),
    deriveAndSetConversationKey: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("@/features/chat/services/message-receipt-manager", () => ({
  MessageReceiptManager: jest.fn().mockImplementation(() => ({
    shouldPushReceipt: jest.fn().mockReturnValue(true),
    getTransientStatuses: jest.fn().mockReturnValue(new Set()),
  })),
}));

jest.mock("@/features/chat/services/chat-service", () => ({
  ChatService: jest.fn().mockImplementation(() => ({
    getAllNotSentMessageForPeer: jest.fn(),
    getOrCreateDirectConversationByPeer: jest.fn(),
  })),
}));

jest.mock("@/features/chat/services/public-chat-service", () => ({
  PublicChatService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@/features/call/services/call-service", () => ({
  CallService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@/features/call/repositories/call-repository", () => ({
  CallRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@/features/call/repositories/call-participant-repository", () => ({
  CallParticipantRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@/features/sync", () => ({
  SyncService: jest.fn().mockImplementation(() => ({
    syncNow: jest.fn().mockResolvedValue(undefined),
    handleConnectivityChange: jest.fn(),
    skipEncryptedMessageUpdatesOnNextSync: jest.fn(),
    cleanup: jest.fn(),
  })),
}));

jest.mock("../core/database", () => ({
  database: {},
}));

jest.mock("../core/utils/logger", () => ({
  appLog: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function createMockAuthContainer(isGuest = true): AuthContainer {
  const user = {
    id: "user-1",
    username: "testuser",
    firstName: "Test",
    lastName: "User",
  };
  return {
    userStore: { isGuest, user },
    sessionStore: { userId: user.id },
    peerService: {
      register: jest.fn().mockResolvedValue({ addressChanged: false }),
      markOffline: jest.fn(),
      markOnline: jest.fn(),
      getAllPeers: jest.fn().mockResolvedValue([]),
      findPeerById: jest.fn(),
      findDiscoveredPeerById: jest.fn(),
      getDiscoveredPeers: jest.fn(() => []),
      getOrCreatePeerById: jest.fn(),
    },
    peerRepository: {
      getAllPeerIds: jest.fn().mockResolvedValue([]),
    },
    guestMigrationService: {
      setMessageRepository: jest.fn(),
    },
    userService: {
      setCleanUpService: jest.fn(),
    },
  } as unknown as AuthContainer;
}

function createMockAppModeStore(): AppModeStore {
  return {
    isTcpAllowed: jest.fn(() => true),
    isWebSocketAllowed: jest.fn(() => true),
    isZeroconfAllowed: jest.fn(() => false),
    getEffectiveMode: jest.fn(() => "server"),
    isModeAllowed: jest.fn(() => true),
  } as unknown as AppModeStore;
}

function createTestContainer(isGuest = true): MainContainer {
  const authContainer = createMockAuthContainer(isGuest);
  const appModeStore = createMockAppModeStore();
  return new MainContainer(authContainer, appModeStore);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const secureConfig = require("../core/stores/secure-config");

describe("MainContainer.initializeKeys", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls localEncryptionService.initialize()", async () => {
    const container = createTestContainer(true);
    await (container as any).initializeKeys();
    expect(container.localEncryptionService.initialize).toHaveBeenCalled();
  });

  it("returns a KeysReady branded token", async () => {
    const container = createTestContainer(true);
    const result = await (container as any).initializeKeys();
    expect(result).toEqual({ _brand: "KeysReady" });
  });

  it("loads guest keys and preloads conversation keys for guest users", async () => {
    const container = createTestContainer(true);
    await (container as any).initializeKeys();
    expect(container.peerKeyService.initGuestKey).toHaveBeenCalled();
    expect(container.conversationKeyManager.preloadAllConversationKeys).toHaveBeenCalled();
  });
});

describe("MainContainer.handleMigration", () => {
  const keysReadyToken = { _brand: "KeysReady" as const };

  beforeEach(() => {
    jest.clearAllMocks();
    secureConfig.getMigrationState.mockResolvedValue(null);
  });

  it("does not call reEncryptAfterMigration when no migration state and hasMigrationKeys is false", async () => {
    const container = createTestContainer(false);
    (container.conversationKeyStore.hasMigrationKeys as jest.Mock).mockReturnValue(false);
    secureConfig.getMigrationState.mockResolvedValue(null);

    await (container as any).handleMigration(keysReadyToken);

    expect(container.messageRepository.reEncryptAfterMigration).not.toHaveBeenCalled();
  });

  it("calls reEncryptAfterMigration and clearMigrationState when migration is in_progress", async () => {
    const container = createTestContainer(false);
    (container.conversationKeyStore.hasMigrationKeys as jest.Mock).mockReturnValue(false);
    (container.peerKeyService.getMySecretKey as jest.Mock).mockReturnValue(new Uint8Array(32));
    secureConfig.getMigrationState.mockResolvedValue("in_progress");

    await (container as any).handleMigration(keysReadyToken);

    expect(container.messageRepository.reEncryptAfterMigration).toHaveBeenCalledTimes(1);
    expect(secureConfig.clearMigrationState).toHaveBeenCalledTimes(1);
  });

  it("calls reEncryptAfterMigration when hasMigrationKeys is true (post-migration pass)", async () => {
    const container = createTestContainer(false);
    (container.conversationKeyStore.hasMigrationKeys as jest.Mock).mockReturnValue(true);
    (container.peerKeyService.getMySecretKey as jest.Mock).mockReturnValue(new Uint8Array(32));
    secureConfig.getMigrationState.mockResolvedValue(null);

    await (container as any).handleMigration(keysReadyToken);

    expect(container.messageRepository.reEncryptAfterMigration).toHaveBeenCalledTimes(1);
  });

  it("returns a MigrationOk branded token", async () => {
    const container = createTestContainer(false);
    (container.conversationKeyStore.hasMigrationKeys as jest.Mock).mockReturnValue(false);

    const result = await (container as any).handleMigration(keysReadyToken);

    expect(result._brand).toBe("MigrationOk");
  });

  it("returns migrationPushPending true when recovery re-encrypt ran", async () => {
    const container = createTestContainer(false);
    (container.conversationKeyStore.hasMigrationKeys as jest.Mock).mockReturnValue(false);
    (container.peerKeyService.getMySecretKey as jest.Mock).mockReturnValue(new Uint8Array(32));
    secureConfig.getMigrationState.mockResolvedValue("in_progress");

    const result = await (container as any).handleMigration(keysReadyToken);

    expect(result.migrationPushPending).toBe(true);
  });

  it("returns migrationPushPending false when no migration ran", async () => {
    const container = createTestContainer(false);
    (container.conversationKeyStore.hasMigrationKeys as jest.Mock).mockReturnValue(false);
    secureConfig.getMigrationState.mockResolvedValue(null);

    const result = await (container as any).handleMigration(keysReadyToken);

    expect(result.migrationPushPending).toBe(false);
  });
});

// ── Recoverable initialization failures (issue #245) ──────────────────────────

describe("MainContainer.initialize failure handling", () => {
  const { LocalEncryptionService } = jest.requireMock(
    "../crypto/local-encryption-service"
  );

  /** Reads back the ctx the container handed to LocalEncryptionService. */
  function capturedEncryptionCtx() {
    const calls = (LocalEncryptionService as jest.Mock).mock.calls;
    return calls[calls.length - 1][0] as { getPassword: () => string | null };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    secureConfig.getStoredAccessToken.mockResolvedValue("token-1");
    secureConfig.getMigrationState.mockResolvedValue(null);
    setPendingPassword("");
  });

  it("keeps the pending password when a key step fails, so a retry can succeed", async () => {
    // Arrange: guest key load fails after LocalEncryptionService.initialize()
    setPendingPassword("hunter2");
    const container = createTestContainer(true);
    (container.peerKeyService.initGuestKey as jest.Mock).mockRejectedValue(
      new Error("secure store busy")
    );

    // Act
    await expect(container.initialize()).rejects.toBeDefined();

    // Assert: a cleared password makes every retry fail, forcing a force-quit
    expect(capturedEncryptionCtx().getPassword()).toBe("hunter2");
  });

  it("clears the pending password once initialization fully succeeds", async () => {
    // Arrange
    setPendingPassword("hunter2");
    const container = createTestContainer(true);

    // Act
    await container.initialize();

    // Assert
    expect(capturedEncryptionCtx().getPassword()).toBeNull();
  });

  it("does not cache a rejected init promise, so the next call re-runs", async () => {
    // Arrange
    const container = createTestContainer(true);
    const initGuestKey = container.peerKeyService.initGuestKey as jest.Mock;
    initGuestKey.mockRejectedValueOnce(new Error("secure store busy"));

    // Act
    await expect(container.initialize()).rejects.toBeDefined();
    await container.initialize();

    // Assert
    expect(initGuestKey).toHaveBeenCalledTimes(2);
  });

  it("classifies a guest key-load failure with a distinguishable code", async () => {
    // Arrange
    const container = createTestContainer(true);
    (container.peerKeyService.initGuestKey as jest.Mock).mockRejectedValue(
      new Error("secure store busy")
    );

    // Act / Assert
    await expect(container.initialize()).rejects.toMatchObject({
      code: "GUEST_KEY_INIT_FAILED",
    });
  });

  it("classifies a peer key-load failure with a distinguishable code", async () => {
    // Arrange
    const container = createTestContainer(false);
    (container.peerKeyService.initFromSecretKey as jest.Mock).mockRejectedValue(
      new Error("500 from key service")
    );

    // Act / Assert
    await expect(container.initialize()).rejects.toMatchObject({
      code: "PEER_KEY_INIT_FAILED",
    });
  });

  it("classifies a contact key sync failure with a distinguishable code", async () => {
    // Arrange
    const container = createTestContainer(false);
    (container.peerKeyService.getMySecretKey as jest.Mock).mockReturnValue(
      new Uint8Array(32)
    );
    (
      container.peerKeyService.fetchAndDecryptContactKeys as jest.Mock
    ).mockRejectedValue(new Error("network down"));

    // Act / Assert
    await expect(container.initialize()).rejects.toMatchObject({
      code: "CONTACT_KEY_SYNC_FAILED",
    });
  });

  it("preserves the code raised by LocalEncryptionService itself", async () => {
    // Arrange
    const container = createTestContainer(false);
    (container.localEncryptionService.initialize as jest.Mock).mockRejectedValue(
      new KeyInitError("no master key", "MASTER_KEY_UNAVAILABLE")
    );

    // Act / Assert
    await expect(container.initialize()).rejects.toMatchObject({
      code: "MASTER_KEY_UNAVAILABLE",
    });
  });
});
