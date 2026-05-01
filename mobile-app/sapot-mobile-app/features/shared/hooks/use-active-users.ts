import { useEffect, useMemo, useState } from "react";
import { useAppMode } from "../context/app-mode-context";
import { database, Peer } from "../database";
import { peerLog } from "../utils";
import { useMainContainer } from "./use-main-container";

export function useIsUserActive(peerId: string | undefined): boolean {
  const container = useMainContainer();
  const { mode } = useAppMode();
  const userStore = container.userContainer.userStore;
  const [activeIds, setActiveIds] = useState<string[]>([]);

  const wsAllowed =
    (mode === "server" || mode === "auto") && !userStore.isGuest;

  useEffect(() => {
    if (!wsAllowed || !peerId) return;
    const svc = container.activeUsersService;
    svc.requestActiveUsers();
    svc.startPolling();
    const unsub = svc.subscribe((ids) => setActiveIds(ids));
    return () => {
      unsub();
      svc.stopPolling();
    };
  }, [wsAllowed, peerId, container]);

  return peerId !== undefined && activeIds.includes(peerId);
}

export function useActivePeers(): Peer[] {
  const container = useMainContainer();
  const { mode } = useAppMode();
  const userStore = container.userContainer.userStore;
  const peerService = container.userContainer.peerService;
  const connectionService = container.connectionService;

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
    wsAllowed ? container.activeUsersService.getActiveIds() : []
  );
  useEffect(() => {
    if (!wsAllowed) {
      setActiveIds([]);
      return;
    }
    const svc = container.activeUsersService;
    svc.requestActiveUsers();
    svc.startPolling();
    const unsub = svc.subscribe((ids) => {
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
      svc.stopPolling();
    };
  }, [wsAllowed, container, connectionService, peerService]);

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
