import { useEffect, useMemo, useState } from "react";
import { useAppMode } from "../context/app-mode-context";
import { database, Peer } from "../database";
import { peerLog } from "../utils";
import { useUserStore } from "./use-user-store";
import { useAcitveUserService } from "./use-active-user-service";
import { usePeerService } from "./use-peer-service";
import { useConnectionService } from "./use-connection-service";

export function useIsUserActive(peerId: string | undefined): boolean {
  const { mode } = useAppMode();
  const userStore = useUserStore();
  const activeUserService = useAcitveUserService();
  const [activeIds, setActiveIds] = useState<string[]>([]);

  const wsAllowed =
    (mode === "server" || mode === "auto") && !userStore.isGuest;

  useEffect(() => {
    if (!wsAllowed || !peerId) return;
    activeUserService.requestActiveUsers();
    activeUserService.startPolling();
    const unsub = activeUserService.subscribe((ids) => setActiveIds(ids));
    return () => {
      unsub();
      activeUserService.stopPolling();
    };
  }, [wsAllowed, peerId, activeUserService]);

  return peerId !== undefined && activeIds.includes(peerId);
}

export function useActivePeers(): Peer[] {
  const { mode } = useAppMode();
  const userStore = useUserStore();
  const peerService = usePeerService();
  const connectionService = useConnectionService();
  const activeUserService = useAcitveUserService()

  const [allPeers, setAllPeers] = useState<Peer[]>([]);
  useEffect(() => {
    const sub = database
      .get<Peer>("peers")
      .query()
      .observe()
      .subscribe((peers) => setAllPeers(peers));
    return () => sub.unsubscribe();
  }, []);

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
            ids.map((id) =>
              peerService.getOrCreatePeerById(id, connectionService)
            )
          );
          setActiveIds(ids);
        } catch (error) {
          peerLog.warn("Error activating peers", error);
        }
      })();
    });
    return () => {
      unsub();
      activeUserService.stopPolling();
    };
  }, [wsAllowed, activeUserService, connectionService, peerService]);

  return useMemo(() => {
    switch (mode) {
      case "lan":
        return allPeers.filter((p) => p.isOnline);
      case "server":
        return allPeers.filter((p) => activeIds.includes(p.id));
      case "auto":
        return allPeers.filter((p) => p.isOnline || activeIds.includes(p.id));
    }
  }, [mode, allPeers, activeIds]);
}
