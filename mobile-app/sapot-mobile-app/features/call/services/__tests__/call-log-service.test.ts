import { CallLogService } from "../call-log-service";
import { CallStatus, CallType } from "@/features/shared/database/model/Call";

describe("CallLogService pure helpers", () => {
  // Pure helpers don't touch deps; construct with stubs
  const svc = new CallLogService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const baseSession = {
    callId: "call-1",
    peerId: "peer-1",
    callType: CallType.AUDIO,
    startedAt: new Date("2024-01-01T10:00:00.000Z"),
    peerName: "Alice",
    isIncoming: false,
    finalized: false,
    conversationId: "conv-1",
  };

  describe("buildCallLogMessage", () => {
    it("returns 'Call declined' for rejected status", () => {
      const result = svc.buildCallLogMessage(
        baseSession,
        CallStatus.REJECTED,
        new Date("2024-01-01T10:01:00.000Z"),
      );
      expect(result).toBe("Call declined");
    });

    it("returns missed audio call label for missed audio call", () => {
      const result = svc.buildCallLogMessage(
        baseSession,
        CallStatus.MISSED,
        new Date("2024-01-01T10:01:00.000Z"),
      );
      expect(result).toBe("Missed audio call");
    });

    it("returns missed video call label for missed video call", () => {
      const session = { ...baseSession, callType: CallType.VIDEO };
      const result = svc.buildCallLogMessage(
        session,
        CallStatus.MISSED,
        new Date("2024-01-01T10:01:00.000Z"),
      );
      expect(result).toBe("Missed video call");
    });

    it("renders M:SS duration for a 65-second answered audio call", () => {
      const answeredAt = new Date("2024-01-01T10:00:00.000Z");
      const endTime = new Date("2024-01-01T10:01:05.000Z"); // 65s later
      const session = { ...baseSession, answeredAt };
      const result = svc.buildCallLogMessage(session, CallStatus.COMPLETED, endTime);
      expect(result).toBe("Audio call • 1:05");
    });

    it("renders H:MM:SS duration for a call over one hour", () => {
      const answeredAt = new Date("2024-01-01T10:00:00.000Z");
      const endTime = new Date("2024-01-01T11:01:01.000Z"); // 3661s later
      const session = { ...baseSession, callType: CallType.VIDEO, answeredAt };
      const result = svc.buildCallLogMessage(session, CallStatus.COMPLETED, endTime);
      expect(result).toBe("Video call • 1:01:01");
    });

    it("uses durationSecondsOverride when provided", () => {
      const session = { ...baseSession };
      const result = svc.buildCallLogMessage(
        session,
        CallStatus.COMPLETED,
        new Date(),
        125,
      );
      expect(result).toBe("Audio call • 2:05");
    });
  });

  describe("resolveFinalStatus", () => {
    it("returns REJECTED for rejected reason", () => {
      expect(svc.resolveFinalStatus("rejected")).toBe(CallStatus.REJECTED);
    });

    it("returns MISSED for missed reason", () => {
      expect(svc.resolveFinalStatus("missed")).toBe(CallStatus.MISSED);
    });

    it("returns COMPLETED for completed reason", () => {
      expect(svc.resolveFinalStatus("completed")).toBe(CallStatus.COMPLETED);
    });

    it("returns COMPLETED when session was answered (no reason)", () => {
      const session = { ...baseSession, answeredAt: new Date() };
      expect(svc.resolveFinalStatus(undefined, session)).toBe(CallStatus.COMPLETED);
    });

    it("returns MISSED when session was not answered and no reason", () => {
      expect(svc.resolveFinalStatus(undefined, baseSession)).toBe(CallStatus.MISSED);
    });
  });

  describe("getDisplayName", () => {
    it("prefers full name when both first and last name are present", () => {
      const peer = { firstName: "Alice", lastName: "Smith", username: "asmith" } as never;
      expect(svc.getDisplayName(peer)).toBe("Alice Smith");
    });

    it("falls back to username when no full name", () => {
      const peer = { firstName: undefined, lastName: undefined, username: "asmith" } as never;
      expect(svc.getDisplayName(peer)).toBe("asmith");
    });

    it("falls back to Unknown when no name or username", () => {
      const peer = { firstName: undefined, lastName: undefined, username: undefined } as never;
      expect(svc.getDisplayName(peer)).toBe("Unknown");
    });
  });
});
