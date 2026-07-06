import { useSyncExternalStore } from "react";
import {
  NetworkFaultConfig,
  NetworkTransport,
  OfflineFlag,
  faultInjector,
} from "../services/fault-injector";

export function useFaultInjector() {
  const offlineFlags = useSyncExternalStore(
    (listener) => faultInjector.subscribe(listener),
    () => faultInjector.getOfflineFlags(),
    () => faultInjector.getOfflineFlags()
  );

  const tcpFaults = useSyncExternalStore(
    (listener) => faultInjector.subscribe(listener),
    () => faultInjector.getNetworkFaults("tcp"),
    () => faultInjector.getNetworkFaults("tcp")
  );

  const wsFaults = useSyncExternalStore(
    (listener) => faultInjector.subscribe(listener),
    () => faultInjector.getNetworkFaults("ws"),
    () => faultInjector.getNetworkFaults("ws")
  );

  return {
    offlineFlags,
    networkFaults: { tcp: tcpFaults, ws: wsFaults },
    setOfflineFlag: (flag: OfflineFlag, value: boolean) =>
      faultInjector.setOfflineFlag(flag, value),
    setNetworkFaults: (
      transport: NetworkTransport,
      config: Partial<NetworkFaultConfig>
    ) => faultInjector.setNetworkFaults(transport, config),
    resetNetworkFaults: (transport: NetworkTransport) =>
      faultInjector.resetNetworkFaults(transport),
  };
}
