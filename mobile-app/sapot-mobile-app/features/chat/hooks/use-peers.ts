import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import zeroconf from "../services/zeroconf-service";
import { database } from "@/features/shared/database";
import { useObservable } from "./use-observable";
import Peer from "@/features/shared/database/model/Peer";
import useDatabase from "@/features/shared/hooks/use-database";

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
    const knownSet = new Set(knownPeers.map((p) => p._raw.id));
    const discoveredSet = new Set(discoveredPeers.map((p) => p.id));

    const newDiscoveredPeers = discoveredPeers.filter(
      (peer) => !knownSet.has(peer.id)
    );

    console.log("New discovered peers:", newDiscoveredPeers);

    newDiscoveredPeers.forEach((newPeer) => {
      createPeer({
        id: newPeer.id,
        ipAddress: newPeer.ipAddress,
        port: newPeer.port,
        username: newPeer.username,
      });
    });

    console.log("Known peers:", knownPeers);

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
    console.log("Peers:", peers);
  }, [peers]);

  const getServices = () => {
    console.log(zeroconf.getSnapshot());
  };

  return { getServices, peers };
};

export default usePeers;
