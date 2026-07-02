import { toAppError } from "@/features/shared/core/errors";
import { useEffect, useState } from "react";
import { Peer } from "../core/database";
import { hookLog } from "../core/utils/logger";
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
        const appErr = toAppError(error, "database");
        hookLog.error("[usePeers] load failed", appErr);
      }
    };
    init();
  }, [peerService]);
  return { peers };
};

export default usePeers;
