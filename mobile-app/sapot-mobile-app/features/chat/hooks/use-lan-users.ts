import { useEffect, useState, useSyncExternalStore } from "react";
import zeroconf from "../services/zeroconf-service";
import { Service } from "react-native-zeroconf";

const useLanUsers = () => {
  const services = useSyncExternalStore(
    (callback) => zeroconf.subscribe(callback),
    () => zeroconf.getSnapshot()
  );

  const getServices = () => {
    console.log(zeroconf.getSnapshot());
  };

  return { getServices, services };
};

export default useLanUsers;
