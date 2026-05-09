import { useEffect, useState } from "react";
import { Peer } from "../database";
import { hookLog } from "../utils/logger";
import { usePeerService } from "./use-peer-service";
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
