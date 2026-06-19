import * as Notifications from "expo-notifications";
import { NotificationService } from "../notification-service";

const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockDismiss = Notifications.dismissNotificationAsync as jest.Mock;

describe("NotificationService", () => {
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationService();
  });

  describe("showCallAlert", () => {
    it("schedules notification with incoming-call channel and ringtone sound", async () => {
      await service.showCallAlert({
        callerId: "peer-1",
        callType: "audio-call",
        callerName: "Alice",
      });

      expect(mockSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            sound: "ringtone.mp3",
          }),
          trigger: expect.objectContaining({
            channelId: "incoming-call",
          }),
        })
      );
    });

    it("includes caller name in notification body", async () => {
      await service.showCallAlert({
        callerId: "peer-1",
        callType: "audio-call",
        callerName: "Bob",
      });

      expect(mockSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            body: expect.stringContaining("Bob"),
          }),
        })
      );
    });

    it("maps video-call type to video in data payload", async () => {
      await service.showCallAlert({
        callerId: "peer-1",
        callType: "video-call",
        callerName: "Alice",
        conversationId: "conv-1",
      });

      expect(mockSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            data: expect.objectContaining({
              call_type: "video",
            }),
          }),
        })
      );
    });

    it("maps non-video-call type to audio in data payload", async () => {
      await service.showCallAlert({
        callerId: "peer-1",
        callType: "audio-call",
        callerName: "Alice",
      });

      expect(mockSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            data: expect.objectContaining({
              call_type: "audio",
            }),
          }),
        })
      );
    });
  });

  describe("dismissCallAlert", () => {
    it("is a no-op when no alert has been shown", async () => {
      await service.dismissCallAlert();

      expect(mockDismiss).not.toHaveBeenCalled();
    });

    it("dismisses the notification after showCallAlert", async () => {
      mockSchedule.mockResolvedValue("notif-abc");

      await service.showCallAlert({
        callerId: "peer-1",
        callType: "audio-call",
        callerName: "Alice",
      });
      await service.dismissCallAlert();

      expect(mockDismiss).toHaveBeenCalledWith("notif-abc");
    });

    it("clears the stored notifId so a second dismissal is a no-op", async () => {
      mockSchedule.mockResolvedValue("notif-abc");

      await service.showCallAlert({
        callerId: "peer-1",
        callType: "audio-call",
        callerName: "Alice",
      });
      await service.dismissCallAlert();
      jest.clearAllMocks();

      await service.dismissCallAlert();
      expect(mockDismiss).not.toHaveBeenCalled();
    });
  });
});
