import { Q } from "@nozbe/watermelondb";
import { useEffect, useMemo, useState } from "react";
import { useAppMode } from "../core/context/app-mode-context";
import { database, Peer } from "../core/database";
import { ConversationParticipant } from "../core/database/model/ConversationParticipant";
import { peerLog } from "../core/utils";
import { useAcitveUserService } from "./use-active-user-service";
import { useConnectionService } from "./use-connection-service";
import { usePeerService } from "./use-peer-service";
import { useUserStore } from "./use-user-store";

peerLog.debug("[use-peer-list-data] module loaded");

export type PeerListEntry = { peer: Peer; isOnline: boolean };

export function usePeerListData(): PeerListEntry[] {
  const { mode } = useAppMode();
  const userStore = useUserStore();
  const peerService = usePeerService();
  const connectionService = useConnectionService();
  const activeUserService = useAcitveUserService();

  const currentUserId = userStore.user.id;

  const [allPeers, setAllPeers] = useState<Peer[]>([]);
  useEffect(() => {
    const sub = database
      .get<Peer>("peers")
      .query()
      .observe()
      .subscribe((peers) => setAllPeers(peers));
    return () => sub.unsubscribe();
  }, []);

  const [conversationPeerIds, setConversationPeerIds] = useState<Set<string>>(
    new Set()
  );
  useEffect(() => {
    const sub = database
      .get<ConversationParticipant>("conversation_participants")
      .query(Q.where("user", Q.notEq(currentUserId)), Q.where("is_deleted", false))
      .observe()
      .subscribe((rows) => {
        setConversationPeerIds(new Set(rows.map((r) => r.user.id)));
      });
    return () => sub.unsubscribe();
  }, [currentUserId]);

  const wsAllowed =
    (mode === "server" || mode === "auto") && !userStore.isGuest;
  const [activeIds, setActiveIds] = useState<string[]>(() =>
    wsAllowed ? activeUserService.getActiveIds() : []
  );
  useEffect(() => {
    if (!wsAllowed) {
      setActiveIds([]);
      return;
    }
    activeUserService.requestActiveUsers();
    activeUserService.startPolling();
    const unsub = activeUserService.subscribe((ids) => {
      (async () => {
        try {
          await Promise.all(
            ids.map((id) => peerService.getOrCreatePeerById(id, connectionService))
          );
          setActiveIds(ids);
        } catch (error) {
          peerLog.warn("peer-list-data › activate peers failed", error);
        }
      })();
    });
    return () => {
      unsub();
      activeUserService.stopPolling();
    };
  }, [wsAllowed, activeUserService, connectionService, peerService]);

  return useMemo(() => {
    const isOnline = (p: Peer): boolean => {
      switch (mode) {
        case "lan":
          return p.isOnline;
        case "server":
          return activeIds.includes(p.id);
        default:
          return p.isOnline || activeIds.includes(p.id);
      }
    };

    return allPeers
      .filter((p) => p.id !== currentUserId)
      .map((p) => ({ peer: p, isOnline: isOnline(p) }))
      .sort((a, b) => {
        const rank = (e: PeerListEntry): number =>
          e.isOnline ? 0 : conversationPeerIds.has(e.peer.id) ? 1 : 2;
        return rank(a) - rank(b);
      });
  }, [allPeers, activeIds, conversationPeerIds, currentUserId, mode]);
}
