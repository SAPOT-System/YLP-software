import { useEffect, useState, useSyncExternalStore } from "react";
import zeroconf from "../services/zeroconf-service";

const useLanUsers = () => {
  const lanUsers = useSyncExternalStore(
    (callback) => zeroconf.subscribe(callback),
    () => zeroconf.getSnapshot()
  );

  const getServices = () => {
    console.log(zeroconf.getSnapshot());
  };

  return { getServices, lanUsers };
};

export default useLanUsers;
