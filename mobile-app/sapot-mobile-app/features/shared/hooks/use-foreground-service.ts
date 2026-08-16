import { useEffect } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import BackgroundService from "react-native-background-actions";
import { backgroundLog } from "../core/utils";

const foregroundServiceTask = async () => {
  await new Promise<void>(() => {
    setInterval(() => {
      backgroundLog.info("bg › foreground service heartbeat");
    }, 30_000);
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

export const useForegroundService = () => {
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "background") {
        void startForegroundService();
      } else if (nextState === "active") {
        void stopForegroundService();
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
      void stopForegroundService();
    };
  }, []);
};
