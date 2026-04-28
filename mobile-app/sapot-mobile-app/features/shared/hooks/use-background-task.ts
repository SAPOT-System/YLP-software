import { useEffect } from "react";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { AppState, AppStateStatus, Platform } from "react-native";
import BackgroundService from "react-native-background-actions";
import { backgroundLog } from "../utils";
import { setAppAlive, SIGNALING_TASK } from "@/task/signaling-task";

// ── Foreground service task ────────────────────────────────────────────────────
// Runs inside the Android foreground service to keep the process alive.
// ConnectionService / DiscoveryService continue running in the same JS context —
// no need to re-start them here.

const foregroundServiceTask = async () => {
  await new Promise<void>(() => {
    const id = setInterval(() => {
      backgroundLog.info("bg › foreground service heartbeat");
    }, 30_000);

    // Promise never resolves — service runs until BackgroundService.stop() is called.
    // setInterval is cleared automatically when the process ends.
    void id;
  });
};

const serviceOptions = {
  taskName: "sapot-connectivity",
  taskTitle: "App is running",
  taskDesc: "Listening for incoming calls...",
  taskIcon: { name: "ic_launcher", type: "mipmap" as const },
  color: "#ffffff",
  parameters: {},
  foregroundServiceType: ["dataSync"] as Array<"dataSync">,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

export const startForegroundService = async () => {
  try {
    if (BackgroundService.isRunning()) return;
    await BackgroundService.start(foregroundServiceTask, serviceOptions);
    backgroundLog.info("bg › foreground service started");
  } catch (error) {
    backgroundLog.error("bg › foreground service start failed", { error });
  }
};

export const stopForegroundService = async () => {
  try {
    if (!BackgroundService.isRunning()) return;
    await BackgroundService.stop();
    backgroundLog.info("bg › foreground service stopped");
  } catch (error) {
    backgroundLog.error("bg › foreground service stop failed", { error });
  }
};

// ── Hook ───────────────────────────────────────────────────────────────────────

export const useBackgroundTask = () => {
  useEffect(() => {
    if (Platform.OS !== "android") return;

    setAppAlive(true);
    registerTask();

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "background") {
        // App moved to background — start foreground service to keep process alive.
        // ConnectionService / DiscoveryService continue running in this JS context.
        startForegroundService();
      } else if (nextState === "active") {
        // App came back to foreground — foreground service notification no longer needed.
        stopForegroundService();
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
      setAppAlive(false);
      stopForegroundService();
    };
  }, []);

  // ── Task registration ────────────────────────────────────────────────────────
  // expo-background-task remains as a 15-minute fallback for force-kill scenarios.

  const registerTask = async () => {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(SIGNALING_TASK);
      if (!isRegistered) {
        await BackgroundTask.registerTaskAsync(SIGNALING_TASK, {
          minimumInterval: 15,
        });
        backgroundLog.info("bg › task registered");
      } else {
        backgroundLog.info("bg › task already registered");
      }
    } catch (error) {
      backgroundLog.error("bg › task registration failed", { error });
    }
  };

  // ── Unregister on logout ─────────────────────────────────────────────────────

  const unregister = async () => {
    try {
      await stopForegroundService();

      const isRegistered = await TaskManager.isTaskRegisteredAsync(SIGNALING_TASK);
      if (isRegistered) {
        await BackgroundTask.unregisterTaskAsync(SIGNALING_TASK);
        backgroundLog.info("bg › task unregistered");
      }
    } catch (error) {
      backgroundLog.error("bg › task unregister failed", { error });
    }
  };

  return { unregister };
};
