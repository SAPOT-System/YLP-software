import { useEffect } from "react";
import zeroconf from "../services/zeroconf-service";

const useLanUsers = () => {
  useEffect(() => {
    zeroconf.publishService();
    zeroconf.startDiscovery();

    return () => {
      zeroconf.close();
    };
  }, []);

  const getServices = () => {
    console.log(zeroconf.getServices)
  };

  return { getServices };
};

export default useLanUsers;
