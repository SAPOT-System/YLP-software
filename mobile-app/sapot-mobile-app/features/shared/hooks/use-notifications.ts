import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { backgroundLog } from "../utils/logger";

Notifications.setNotificationHandler({
  handleNotification: async (
    notification
  ): Promise<Notifications.NotificationBehavior> => {
    const isForegroundService =
      notification.request.content.data?.type === "foreground_service";

    return {
      shouldPlaySound: !isForegroundService,
      shouldSetBadge: false,
      shouldShowBanner: !isForegroundService, // ← required by NotificationBehavior
      shouldShowList: !isForegroundService, // ← required by NotificationBehavior
    };
  },
});

interface IncomingCallData {
  callerId: string;
  callType: string;
  callerName: string;
  notificationId: string;
  conversationId?: string;
}

interface IncomingMessageData {
  conversationId: string;
  senderId: string;
  senderName: string;
  messagePreview: string;
  notificationId: string;
}

export const useNotifications = (
  onIncomingCall: (data: IncomingCallData) => void,
  onIncomingMessage?: (data: IncomingMessageData) => void,
  onIncomingMessageTapped?: (data: IncomingMessageData) => void
) => {
  // ── Fix 2: useRef requires an initial value in newer React types ──────────────
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  const setupListeners = useCallback(() => {
    // App FOREGROUND — notification received while app is open
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data;
        console.log("useNotification", data);

        if (data?.type === "incoming_call") {
          backgroundLog.info("notifications › incoming call received (fg)");

          onIncomingCall({
            callerId: String(data.id ?? ""),
            callType: String(data["call_type"] ?? ""),
            notificationId: notification.request.identifier,
            callerName: String(data.callerName),
            conversationId: data.conversation_id
              ? String(data.conversation_id)
              : undefined,
          });
        } else if (data?.type === "incoming_message") {
          backgroundLog.info("notifications › incoming message received (fg)");

          onIncomingMessage?.({
            conversationId: String(data["conversation_id"] ?? ""),
            senderId: String(data["sender_id"] ?? ""),
            senderName: String(data["sender_name"] ?? ""),
            messagePreview: String(data["message_preview"] ?? ""),
            notificationId: notification.request.identifier,
          });
        }
      });

    // App BACKGROUND or KILLED — user tapped the notification
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;

        if (data?.type === "incoming_call") {
          backgroundLog.info(
            "notifications › incoming call tapped (bg/killed)"
          );

          onIncomingCall({
            callerId: String(data.id ?? ""),
            callType: String(data["call_type"] ?? ""),
            notificationId: response.notification.request.identifier,
            callerName: String(data.callerName),
            conversationId: data.conversation_id
              ? String(data.conversation_id)
              : undefined,
          });
        } else if (data?.type === "incoming_message") {
          backgroundLog.info(
            "notifications › incoming message tapped (bg/killed)"
          );

          onIncomingMessageTapped?.({
            conversationId: String(data["conversation_id"] ?? ""),
            senderId: String(data["sender_id"] ?? ""),
            senderName: String(data["sender_name"] ?? ""),
            messagePreview: String(data["message_preview"] ?? ""),
            notificationId: response.notification.request.identifier,
          });
        }
      });
  }, [onIncomingCall, onIncomingMessageTapped, onIncomingMessage]);

  const setupIncomingCallChannel = async () => {
    try {
      await Notifications.setNotificationChannelAsync("incoming-call", {
        name: "Incoming Calls",
        importance: Notifications.AndroidImportance.MAX,
        sound: "ringtone.mp3",
        vibrationPattern: [0, 500, 200, 500],
        enableLights: true,
        lightColor: "#00FF00",
      });
      backgroundLog.info("notifications › incoming call channel ready");
    } catch (error) {
      backgroundLog.error("notifications › channel setup failed", { error });
    }
  };

  const setupChatMessageChannel = async () => {
    try {
      await Notifications.setNotificationChannelAsync("chat-messages", {
        name: "Chat Messages",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250],
      });
      backgroundLog.info("notifications › chat message channel ready");
    } catch (error) {
      backgroundLog.error("notifications › chat channel setup failed", {
        error,
      });
    }
  };

  useEffect(() => {
    if (Platform.OS !== "android") return;

    setupIncomingCallChannel();
    setupChatMessageChannel();
    requestPermissions();
    setupListeners();

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [setupListeners]);

  const requestPermissions = async () => {
    if (!Device.isDevice) {
      backgroundLog.warn("notifications › physical device required");
      return;
    }

    try {
      const { status: existing } = await Notifications.getPermissionsAsync();

      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") {
          backgroundLog.warn("notifications › permission denied");
          return;
        }
      }

      backgroundLog.info("notifications › permission granted");
    } catch (error) {
      backgroundLog.error("notifications › permission request failed", {
        error,
      });
    }
  };
};
