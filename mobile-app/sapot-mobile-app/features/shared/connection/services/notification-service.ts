import * as Notifications from "expo-notifications";
import { connectionLog } from "@/features/shared/core/utils/logger";

export type IncomingCallData = {
  callerId: string;
  callType: string;
  callerName: string;
  conversationId?: string;
  callId?: string;
};

export class NotificationService {
  private incomingCallNotifId: string | null = null;

  async showCallAlert(data: IncomingCallData): Promise<void> {
    try {
      this.incomingCallNotifId = await Notifications.scheduleNotificationAsync({
        content: {
          title: "📞 Incoming Call",
          body: `${data.callerName} is calling...`,
          sound: "ringtone.mp3",
          data: {
            type: "incoming_call",
            id: data.callerId,
            call_type: data.callType === "video-call" ? "video" : "audio",
            conversation_id: data.conversationId ?? "",
            call_id: data.callId ?? "",
          },
        } as Notifications.NotificationContentInput,
        trigger: {
          channelId: "incoming-call",
        } as Notifications.NotificationTriggerInput,
      });
    } catch (error) {
      connectionLog.error("notification › incoming call notification failed", {
        error,
      });
    }
  }

  async dismissCallAlert(): Promise<void> {
    if (!this.incomingCallNotifId) return;
    try {
      await Notifications.dismissNotificationAsync(this.incomingCallNotifId);
    } catch {
      // best-effort
    }
    this.incomingCallNotifId = null;
  }
}
