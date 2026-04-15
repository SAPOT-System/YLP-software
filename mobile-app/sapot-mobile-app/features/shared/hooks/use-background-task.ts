import { useEffect, useRef } from "react";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager"; // ← isTaskRegisteredAsync lives here
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { backgroundLog } from "../utils";
import { setAppAlive, SIGNALING_TASK } from "@/task/signaling-task";

export const useBackgroundTask = () => {
  const foregroundNotifId = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    // Mark app alive immediately so background task stands down
    // if it wakes up while this component is mounted
    setAppAlive(true);

    setupForegroundChannel();
    registerTask();
    showForegroundNotification().then((id) => {
      foregroundNotifId.current = id;
    });

    return () => {
      // Component unmounting — background task may take over
      setAppAlive(false);
      if (foregroundNotifId.current) {
        Notifications.dismissNotificationAsync(foregroundNotifId.current).catch(
          () => {}
        );
        foregroundNotifId.current = null;
      }
    };
  }, []);

  // ── Channels ───────────────────────────────────────────────────────────────

  const setupForegroundChannel = async () => {
    try {
      await Notifications.setNotificationChannelAsync("foreground-service", {
        name: "App Running",
        importance: Notifications.AndroidImportance.LOW,
        showBadge: false,
        sound: null,
      });
      backgroundLog.info("bg › foreground channel ready");
    } catch (error) {
      backgroundLog.error("bg › foreground channel setup failed", { error });
    }
  };

  // ── Task registration ──────────────────────────────────────────────────────

  const registerTask = async () => {
    try {
      // ✅ isTaskRegisteredAsync is on TaskManager, not BackgroundTask
      const isRegistered =
        await TaskManager.isTaskRegisteredAsync(SIGNALING_TASK);

      if (!isRegistered) {
        await BackgroundTask.registerTaskAsync(SIGNALING_TASK, {
          // ✅ minimumInterval is in MINUTES, 15 is Android's enforced minimum
          // ✅ startOnBoot does not exist in BackgroundTaskOptions
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

  // ── Foreground service notification ───────────────────────────────────────
  // Shows a low-priority persistent notification while the app is open.
  // True process persistence is handled by expo-background-task's foreground
  // service config in app.config.ts — not by this notification.

  const showForegroundNotification = async (): Promise<string | null> => {
    try {
      // Dismiss any existing foreground-service notification to avoid stacking
      // on re-mounts (e.g. hot reload, auth state changes).
      const presented = await Notifications.getPresentedNotificationsAsync();
      for (const n of presented) {
        if (n.request.content.data?.type === "foreground_service") {
          await Notifications.dismissNotificationAsync(n.request.identifier);
        }
      }

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "App is running",
          body: "Listening for incoming calls...",
          data: { type: "foreground_service" },
        } as Notifications.NotificationContentInput,
        trigger: {
          channelId: "foreground-service",
        } as Notifications.NotificationTriggerInput,
      });
      backgroundLog.info("bg › foreground notification shown");
      return id;
    } catch (error) {
      backgroundLog.error("bg › foreground notification failed", { error });
      return null;
    }
  };

  // ── Unregister on logout ───────────────────────────────────────────────────

  const unregister = async () => {
    try {
      // ✅ isTaskRegisteredAsync is on TaskManager
      const isRegistered =
        await TaskManager.isTaskRegisteredAsync(SIGNALING_TASK);

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