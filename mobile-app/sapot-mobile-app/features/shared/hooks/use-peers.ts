import { useEffect, useState } from "react";
import { Peer } from "../database";
import { usePeerService } from "./use-peer-service";

const usePeers = () => {
  const peerService = usePeerService();
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    const init = async () => {
      setPeers(await peerService.getAllPeers());
    };
    init();
  }, []);
  return { peers };
};

export default usePeers;
