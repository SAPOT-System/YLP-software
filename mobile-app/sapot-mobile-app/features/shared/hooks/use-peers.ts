import { useEffect, useState } from "react";
import { Peer } from "../database";
import baseLogger from "../utils/logger";
import { usePeerService } from "./use-peer-service";

const hookLog = baseLogger.extend("hook");
hookLog.debug("[use-peers] module loaded");

const usePeers = () => {
  const peerService = usePeerService();
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    const init = async () => {
      try {
        const nextPeers = await peerService.getAllPeers();
        hookLog.info("[usePeers] loaded", { count: nextPeers.length });
        setPeers(nextPeers);
      } catch (error) {
        hookLog.error("[usePeers] load failed", { error });
      }
    };
    init();
  }, [peerService]);
  return { peers };
};

export default usePeers;
