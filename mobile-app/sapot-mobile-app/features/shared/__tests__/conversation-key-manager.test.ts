import { ConversationKeyManager } from "../services/conversation-key-manager";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("tweetnacl", () => ({
  box: { before: jest.fn(() => new Uint8Array(32)) },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeKey(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const conversationKeyStore = {
    setConversationKey: jest.fn(),
  };

  const peerKeyService = {
    fetchPeerPublicKey: jest.fn().mockResolvedValue(null),
    getMySecretKey: jest.fn().mockReturnValue(makeKey(0xaa)),
  };

  const peerKeyStore = {
    get: jest.fn().mockReturnValue(null),
    load: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    getHistory: jest.fn().mockReturnValue([]),
  };

  const userStore = {
    user: { id: "user-1" },
    isGuest: false,
  };

  const conversationParticipantRepository = {
    isDirectConversationExists: jest.fn().mockResolvedValue(null),
    queryAllParticipants: jest.fn().mockResolvedValue([]),
  };

  return {
    conversationKeyStore: {
      ...conversationKeyStore,
      ...((overrides["conversationKeyStore"] as object) ?? {}),
    } as typeof conversationKeyStore,
    peerKeyService: {
      ...peerKeyService,
      ...((overrides["peerKeyService"] as object) ?? {}),
    } as typeof peerKeyService,
    peerKeyStore: {
      ...peerKeyStore,
      ...((overrides["peerKeyStore"] as object) ?? {}),
    } as typeof peerKeyStore,
    userStore: {
      ...userStore,
      ...((overrides["userStore"] as object) ?? {}),
    } as typeof userStore,
    conversationParticipantRepository: {
      ...conversationParticipantRepository,
      ...((overrides["conversationParticipantRepository"] as object) ?? {}),
    } as typeof conversationParticipantRepository,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ConversationKeyManager", () => {
  describe("deriveAndSetConversationKey", () => {
    it("sets conversation key when peer public key is in the store", async () => {
      const peerPubKey = makeKey(0xbb);
      const deps = makeDeps();
      deps.peerKeyStore.get.mockReturnValue(peerPubKey);
      const manager = new ConversationKeyManager(
        deps.conversationKeyStore as never,
        deps.peerKeyService as never,
        deps.peerKeyStore as never,
        deps.userStore as never,
        deps.conversationParticipantRepository as never,
      );

      await manager.deriveAndSetConversationKey("peer-1", "conv-1");

      expect(deps.conversationKeyStore.setConversationKey).toHaveBeenCalled();
    });

    it("fetches key from server when not in local store for non-guest", async () => {
      const peerPubKey = makeKey(0xcc);
      const deps = makeDeps();
      deps.peerKeyService.fetchPeerPublicKey.mockResolvedValue(peerPubKey);
      const manager = new ConversationKeyManager(
        deps.conversationKeyStore as never,
        deps.peerKeyService as never,
        deps.peerKeyStore as never,
        deps.userStore as never,
        deps.conversationParticipantRepository as never,
      );

      await manager.deriveAndSetConversationKey("peer-1", "conv-1");

      expect(deps.peerKeyService.fetchPeerPublicKey).toHaveBeenCalledWith("peer-1");
      expect(deps.conversationKeyStore.setConversationKey).toHaveBeenCalled();
    });

    it("skips key derivation for guests when peer key not available", async () => {
      const deps = makeDeps();
      (deps.userStore as { isGuest: boolean }).isGuest = true;
      const manager = new ConversationKeyManager(
        deps.conversationKeyStore as never,
        deps.peerKeyService as never,
        deps.peerKeyStore as never,
        deps.userStore as never,
        deps.conversationParticipantRepository as never,
      );

      await manager.deriveAndSetConversationKey("peer-1", "conv-1");

      expect(deps.conversationKeyStore.setConversationKey).not.toHaveBeenCalled();
    });

    it("also sets historical keys before the current key", async () => {
      const hist1 = makeKey(0x01);
      const hist2 = makeKey(0x02);
      const currentKey = makeKey(0x03);
      const deps = makeDeps();
      deps.peerKeyStore.get.mockReturnValue(currentKey);
      deps.peerKeyStore.getHistory.mockReturnValue([hist1, hist2]);
      const manager = new ConversationKeyManager(
        deps.conversationKeyStore as never,
        deps.peerKeyService as never,
        deps.peerKeyStore as never,
        deps.userStore as never,
        deps.conversationParticipantRepository as never,
      );

      await manager.deriveAndSetConversationKey("peer-1", "conv-1");

      // 2 historical + 1 current = 3 calls
      expect(deps.conversationKeyStore.setConversationKey).toHaveBeenCalledTimes(3);
    });
  });

  describe("rederiveKeyForPeer", () => {
    it("re-derives key when a direct conversation exists for the peer", async () => {
      const peerPubKey = makeKey(0xdd);
      const deps = makeDeps();
      deps.conversationParticipantRepository.isDirectConversationExists.mockResolvedValue("conv-42");
      deps.peerKeyStore.get.mockReturnValue(peerPubKey);
      const manager = new ConversationKeyManager(
        deps.conversationKeyStore as never,
        deps.peerKeyService as never,
        deps.peerKeyStore as never,
        deps.userStore as never,
        deps.conversationParticipantRepository as never,
      );

      await manager.rederiveKeyForPeer("peer-1");

      expect(deps.conversationKeyStore.setConversationKey).toHaveBeenCalled();
    });

    it("is a no-op when no direct conversation exists for the peer", async () => {
      const deps = makeDeps();
      deps.conversationParticipantRepository.isDirectConversationExists.mockResolvedValue(null);
      const manager = new ConversationKeyManager(
        deps.conversationKeyStore as never,
        deps.peerKeyService as never,
        deps.peerKeyStore as never,
        deps.userStore as never,
        deps.conversationParticipantRepository as never,
      );

      await manager.rederiveKeyForPeer("peer-1");

      expect(deps.conversationKeyStore.setConversationKey).not.toHaveBeenCalled();
    });
  });

  describe("preloadAllConversationKeys", () => {
    it("derives keys for every peer-conversation pair from participants", async () => {
      const peerPubKey = makeKey(0xee);
      const myId = "user-1";
      const participants = [
        { _raw: { user: "peer-A", conversation: "conv-1" } },
        { _raw: { user: myId, conversation: "conv-1" } }, // self — skip
        { _raw: { user: "peer-B", conversation: "conv-2" } },
      ];
      const deps = makeDeps();
      deps.conversationParticipantRepository.queryAllParticipants.mockResolvedValue(participants);
      deps.peerKeyStore.get.mockReturnValue(peerPubKey);
      const manager = new ConversationKeyManager(
        deps.conversationKeyStore as never,
        deps.peerKeyService as never,
        deps.peerKeyStore as never,
        deps.userStore as never,
        deps.conversationParticipantRepository as never,
      );

      await manager.preloadAllConversationKeys();

      // One setConversationKey call per unique peer (peer-A and peer-B; self is skipped)
      expect(deps.conversationKeyStore.setConversationKey).toHaveBeenCalledTimes(2);
    });

    it("is a no-op when there are no participants", async () => {
      const deps = makeDeps();
      const manager = new ConversationKeyManager(
        deps.conversationKeyStore as never,
        deps.peerKeyService as never,
        deps.peerKeyStore as never,
        deps.userStore as never,
        deps.conversationParticipantRepository as never,
      );

      await manager.preloadAllConversationKeys();

      expect(deps.conversationKeyStore.setConversationKey).not.toHaveBeenCalled();
    });
  });
});
