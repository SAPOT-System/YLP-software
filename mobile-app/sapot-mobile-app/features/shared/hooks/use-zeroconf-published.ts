import { useSyncExternalStore } from "react";
import { useAppMode } from "../context";
import { useDiscoveryService } from "./use-discovery-service";

/**
 * Hook that returns the Zeroconf publication state.
 * @returns { isPublished: boolean; isZeroconfAllowed: boolean }
 */
export function useZeroconfPublished(): {
  isPublished: boolean;
  isZeroconfAllowed: boolean;
} {
  const discoveryService = useDiscoveryService();
  const { store } = useAppMode();
  
  const isPublished = useSyncExternalStore(
    (onStoreChange) => {
      const unsubscribe = discoveryService.subscribeToPublished(onStoreChange);
      return unsubscribe;
    },
    () => discoveryService.isPublished(),
    () => false
  );

  const isZeroconfAllowed = store.isZeroconfAllowed(false); // Pass false as guest status - the actual check happens in DiscoveryService

  return { isPublished, isZeroconfAllowed };
}
