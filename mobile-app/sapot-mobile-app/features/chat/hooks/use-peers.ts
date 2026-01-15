import { useEffect, useState } from "react";
import { Peer } from "@/features/shared";
import { usePeerDatabaseService } from "./use-container";

const usePeers = () => {
  const peerDatabaseService = usePeerDatabaseService();
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    const init = async () => {
      setPeers(await peerDatabaseService.queryAll());
    };
    init();
  }, []);
  return { peers };
};

export default usePeers;
