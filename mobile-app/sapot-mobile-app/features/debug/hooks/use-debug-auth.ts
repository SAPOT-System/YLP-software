import { useUserService } from "@/features/auth/hooks/use-user-service";
import { authLog } from "@/features/shared/core/utils/logger";
import { useUserStore } from "@/features/shared/hooks/use-user-store";
import * as Updates from "expo-updates";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DebugAuthService,
  DebugAuthSnapshot,
  DebugUserRole,
} from "../services/debug-auth-service";

export function useDebugAuth() {
  const userService = useUserService();
  const userStore = useUserStore();

  const debugAuthService = useMemo(
    () => new DebugAuthService(userService, userStore),
    [userService, userStore]
  );

  const [snapshot, setSnapshot] = useState<DebugAuthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshSnapshot = useCallback(async () => {
    setSnapshot(await debugAuthService.getSnapshot());
  }, [debugAuthService]);

  // Restarts the app so every in-memory service/store re-initializes from
  // secure storage instead of holding onto stale state from before the
  // action ran. Falls back to a snapshot refresh if the restart itself
  // isn't available in this runtime.
  const restartApp = useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch (error) {
      authLog.warn("debug-auth › restart failed, refreshing snapshot instead", {
        error,
      });
      await refreshSnapshot();
    }
  }, [refreshSnapshot]);

  const seedTestUser = useCallback(
    async (role: DebugUserRole) => {
      setLoading(true);
      try {
        await debugAuthService.seedTestUser(role);
        await restartApp();
      } finally {
        setLoading(false);
      }
    },
    [debugAuthService, restartApp]
  );

  const seedLanUser = useCallback(async () => {
    setLoading(true);
    try {
      await debugAuthService.seedLanUser();
      await restartApp();
    } finally {
      setLoading(false);
    }
  }, [debugAuthService, restartApp]);

  const setRole = useCallback(
    async (role: DebugUserRole) => {
      debugAuthService.setRole(role);
      await refreshSnapshot();
    },
    [debugAuthService, refreshSnapshot]
  );

  const injectFakeAccessToken = useCallback(async () => {
    setLoading(true);
    try {
      await debugAuthService.injectFakeAccessToken();
      await refreshSnapshot();
    } finally {
      setLoading(false);
    }
  }, [debugAuthService, refreshSnapshot]);

  const clearAccessToken = useCallback(async () => {
    setLoading(true);
    try {
      await debugAuthService.clearAccessToken();
      await refreshSnapshot();
    } finally {
      setLoading(false);
    }
  }, [debugAuthService, refreshSnapshot]);

  const forceLogout = useCallback(async () => {
    setLoading(true);
    try {
      await debugAuthService.forceLogout();
      await restartApp();
    } finally {
      setLoading(false);
    }
  }, [debugAuthService, restartApp]);

  const resetAuthState = useCallback(async () => {
    setLoading(true);
    try {
      await debugAuthService.resetAuthState();
      await restartApp();
    } finally {
      setLoading(false);
    }
  }, [debugAuthService, restartApp]);

  useEffect(() => {
    refreshSnapshot();
  }, [refreshSnapshot]);

  return {
    snapshot,
    loading,
    refreshSnapshot,
    seedTestUser,
    seedLanUser,
    setRole,
    injectFakeAccessToken,
    clearAccessToken,
    forceLogout,
    resetAuthState,
  };
}
