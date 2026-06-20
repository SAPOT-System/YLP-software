import nacl from "tweetnacl";
import { ConversationKeyStore } from "@/features/chat/repositories/conversation-key-store";
import { ConversationParticipantRepository } from "@/features/chat/repositories/conversation-participant-repository";
import { PeerKeyService } from "./peer-key-service";
import { PeerKeyStore } from "./peer-key-store";
import { chatLog } from "../utils/logger";
import { toAppError } from "../errors";

type KeyManagerUserStore = {
  user: { id: string };
  isGuest: boolean;
};

export class ConversationKeyManager {
  constructor(
    private conversationKeyStore: ConversationKeyStore,
    private peerKeyService: PeerKeyService,
    private peerKeyStore: PeerKeyStore,
    private userStore: KeyManagerUserStore,
    private conversationParticipantRepository: ConversationParticipantRepository,
  ) {}

  async deriveAndSetConversationKey(
    peerId: string,
    conversationId: string,
  ): Promise<void> {
    let peerPubKey = this.peerKeyStore.get(peerId);
    if (!peerPubKey) {
      peerPubKey = await this.peerKeyStore.load(peerId);
    }

    if (!peerPubKey) {
      if (this.userStore.isGuest) {
        chatLog.debug("chat › guest: peer key not yet in store, deferring", {
          peerId,
          conversationId,
        });
        return;
      }

      chatLog.info("chat › peer key missing locally, fetching from server", {
        peerId,
        conversationId,
      });
      peerPubKey = await this.peerKeyService.fetchPeerPublicKey(peerId);
      if (peerPubKey) {
        this.peerKeyStore.set(peerId, peerPubKey);
      } else {
        chatLog.debug(
          "chat › peer key unavailable from server, deferring until TCP handshake",
          { peerId, conversationId },
        );
        return;
      }
    }

    const mySecretKey = this.peerKeyService.getMySecretKey();
    if (!mySecretKey) {
      chatLog.warn(
        "chat › local ECDH secret key not initialized, deferring key derivation",
        { peerId, conversationId },
      );
      return;
    }

    const historicalPubKeys = this.peerKeyStore.getHistory(peerId);
    for (const histPub of historicalPubKeys) {
      this.conversationKeyStore.setConversationKey(
        conversationId,
        nacl.box.before(histPub, mySecretKey),
      );
    }
    const sharedKey = nacl.box.before(peerPubKey, mySecretKey);
    this.conversationKeyStore.setConversationKey(conversationId, sharedKey);
    chatLog.debug("chat › conversation key derived", {
      peerId,
      conversationId,
      historicalKeys: historicalPubKeys.length,
    });
  }

  async rederiveKeyForPeer(peerId: string): Promise<void> {
    try {
      const conversationId =
        await this.conversationParticipantRepository.isDirectConversationExists([
          peerId,
          this.userStore.user.id,
        ]);
      if (!conversationId) return;
      await this.deriveAndSetConversationKey(peerId, conversationId);
      chatLog.debug("chat › conversation key re-derived after peer key arrival", {
        peerId,
        conversationId,
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.warn("chat › rederiveKeyForPeer failed", { peerId, ...appErr });
    }
  }

  async preloadAllConversationKeys(): Promise<void> {
    try {
      const participants =
        await this.conversationParticipantRepository.queryAllParticipants();
      const myId = this.userStore.user.id;
      const seen = new Set<string>();
      for (const p of participants) {
        const raw = p._raw as Record<string, string>;
        const peerId = raw.user;
        const conversationId = raw.conversation;
        if (!peerId || !conversationId || peerId === myId) continue;
        const key = `${peerId}:${conversationId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          await this.deriveAndSetConversationKey(peerId, conversationId);
        } catch {
          // Peer key not yet available — key will be derived on first interaction
        }
      }
    } catch (error) {
      const appErr = toAppError(error, "database");
      chatLog.warn("chat › preload conversation keys failed", appErr);
    }
  }
}
