import { useAuth } from "@/features/auth";
import { useServerHealth } from "@/features/shared/core/context";
import { useEffect } from "react";

export function ServerDownReloginTransition() {
  const {
    needsReloginForServer,
    isOfflineWithExpiredToken,
    transitionReloginToOffline,
    transitionOfflineToRelogin,
  } = useAuth();
  const { online } = useServerHealth();

  useEffect(() => {
    if (needsReloginForServer && !online) {
      transitionReloginToOffline();
    }
  }, [needsReloginForServer, online, transitionReloginToOffline]);

  useEffect(() => {
    if (isOfflineWithExpiredToken && online) {
      transitionOfflineToRelogin();
    }
  }, [isOfflineWithExpiredToken, online, transitionOfflineToRelogin]);

  return null;
}
