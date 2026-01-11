import { useEffect, useState, useSyncExternalStore } from "react";
import zeroconf from "../services/zeroconf-service";

const usePeers = () => {
  const peers = useSyncExternalStore(
    (callback) => zeroconf.subscribe(callback),
    () => zeroconf.getSnapshot()
  );

  const getServices = () => {
    console.log(zeroconf.getSnapshot());
  };

  return { getServices, peers };
};

export default usePeers;
