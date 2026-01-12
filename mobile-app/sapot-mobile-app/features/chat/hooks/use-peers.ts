import { useEffect, useMemo, useSyncExternalStore } from "react";
import zeroconf from "../services/zeroconf-service";
import { useObservable } from "./use-observable";
import { Peer, useDatabase, database } from "@/features/shared";

const usePeers = () => {
  // Get currently discovered peers in LAN
  const discoveredPeers = useSyncExternalStore(
    (callback) => zeroconf.subscribe(callback),
    () => zeroconf.getSnapshot()
  );
  const { createPeer } = useDatabase();

  const knownPeers$ = useMemo(
    () => database.get<Peer>("peers").query().observe(),
    []
  );
  // Get live peers data
  const knownPeers = useObservable<Peer>(knownPeers$, []);

  // Get peers with online status
  const peers = useMemo(() => {
    const discoveredSet = new Set(discoveredPeers.map((p) => p.id));

    return knownPeers.map((p) => {
      if (discoveredSet.has(p.id)) {
        return {
          id: p._raw.id,
          username: p.username,
          port: p.port,
          ipAddress: p.ip_address,
          online: true,
        };
      } else {
        return {
          id: p._raw.id,
          username: p.username,
          port: p.port,
          ipAddress: p.ip_address,
          online: false,
        };
      }
    });
  }, [knownPeers, discoveredPeers]);

  useEffect(() => {
    // Examine every discovered peers if stored in database or not
    const run = () => {
      const knownSet = new Set(knownPeers.map((p) => p._raw.id));
      const newDiscoveredPeers = discoveredPeers.filter(
        (peer) => !knownSet.has(peer.id)
      );
      newDiscoveredPeers.forEach((newPeer) => {
        createPeer({
          id: newPeer.id,
          ipAddress: newPeer.ipAddress,
          port: newPeer.port,
          username: newPeer.username,
        });
      });
    };

    run();

    // Run every 5 seconds
    const interval = setInterval(run, 5000);

    return () => clearInterval(interval);
  }, [knownPeers, discoveredPeers]);

  useEffect(() => {
    console.log("[usePeers]: Peers:", peers);
  }, [peers]);

  const getServices = () => {
    console.log(zeroconf.getSnapshot());
  };

  return { getServices, peers };
};

export default usePeers;
