import {
  CallMessageRouter,
  CallMessageRouterDeps,
} from "../call-message-router";
import {
  AudioCallMessage,
  CallEndedMessage,
  CallMessage,
  CallReadyMessage,
  CallRejectedMessage,
  VideoCallMessage,
} from "../../types";

function makeDeps(overrides: Partial<CallMessageRouterDeps> = {}): CallMessageRouterDeps {
  return {
    isBusyFor: jest.fn().mockReturnValue(false),
    hasActiveCall: jest.fn().mockReturnValue(false),
    notify: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeAudioCall(from = "peer-1"): AudioCallMessage {
  return {
    type: "audio-call",
    data: { from, to: "me", callerName: "Alice", callId: "call-abc", conversationId: "conv-1" },
  };
}

function makeVideoCall(from = "peer-1"): VideoCallMessage {
  return {
    type: "video-call",
    data: { from, to: "me", callerName: "Bob", callId: "call-xyz", conversationId: "conv-2" },
  };
}

function makeCallEnded(from = "peer-1"): CallEndedMessage {
  return {
    type: "call-ended",
    data: { from, to: "me", status: "completed", callType: "audio" },
  };
}

function makeCallReady(from = "peer-1"): CallReadyMessage {
  return { type: "call-ready", data: { from, to: "me" } };
}

function makeCallRejectedBusy(from = "peer-1"): CallRejectedMessage {
  return {
    type: "call-rejected",
    data: { from, to: "me", reason: "busy", callId: "call-abc", conversationId: "conv-1", callType: "audio" },
  };
}

function makeCallRejectedDeclined(from = "peer-1"): CallRejectedMessage {
  return {
    type: "call-rejected",
    data: { from, to: "me", reason: "declined" },
  };
}

describe("CallMessageRouter", () => {
  describe("audio-call", () => {
    it("returns busy-reject when isBusyFor is true", async () => {
      const deps = makeDeps({ isBusyFor: jest.fn().mockReturnValue(true) });
      const router = new CallMessageRouter(deps);

      const result = await router.handle(makeAudioCall("peer-1"));

      expect(result.action).toBe("busy-reject");
      if (result.action === "busy-reject") {
        expect(result.peerId).toBe("peer-1");
        expect(result.callType).toBe("audio");
        expect(result.callId).toBe("call-abc");
      }
    });

    it("does not call notify when busy-reject", async () => {
      const deps = makeDeps({ isBusyFor: jest.fn().mockReturnValue(true) });
      const router = new CallMessageRouter(deps);

      await router.handle(makeAudioCall());

      expect(deps.notify).not.toHaveBeenCalled();
    });

    it("returns glare when hasActiveCall is true for the caller", async () => {
      const deps = makeDeps({ hasActiveCall: jest.fn().mockReturnValue(true) });
      const router = new CallMessageRouter(deps);

      const result = await router.handle(makeAudioCall("peer-1"));

      expect(result.action).toBe("glare");
      if (result.action === "glare") {
        expect(result.peerId).toBe("peer-1");
        expect(result.eventName).toBe("audio-call");
      }
    });

    it("calls notify for glare incoming call", async () => {
      const deps = makeDeps({ hasActiveCall: jest.fn().mockReturnValue(true) });
      const router = new CallMessageRouter(deps);

      await router.handle(makeAudioCall("peer-1"));

      expect(deps.notify).toHaveBeenCalledWith(
        expect.objectContaining({ callerId: "peer-1", callType: "audio-call" })
      );
    });

    it("returns emit with audio-call event for normal incoming call", async () => {
      const deps = makeDeps();
      const router = new CallMessageRouter(deps);

      const result = await router.handle(makeAudioCall("peer-1"));

      expect(result.action).toBe("emit");
      if (result.action === "emit") {
        expect(result.eventName).toBe("audio-call");
        expect(result.payload).toMatchObject({ peerId: "peer-1", callerName: "Alice" });
      }
    });

    it("calls notify for normal incoming audio call", async () => {
      const deps = makeDeps();
      const router = new CallMessageRouter(deps);

      await router.handle(makeAudioCall("peer-1"));

      expect(deps.notify).toHaveBeenCalledWith(
        expect.objectContaining({ callerId: "peer-1", callType: "audio-call" })
      );
    });
  });

  describe("video-call", () => {
    it("returns busy-reject when isBusyFor is true", async () => {
      const deps = makeDeps({ isBusyFor: jest.fn().mockReturnValue(true) });
      const router = new CallMessageRouter(deps);

      const result = await router.handle(makeVideoCall("peer-2"));

      expect(result.action).toBe("busy-reject");
      if (result.action === "busy-reject") {
        expect(result.peerId).toBe("peer-2");
        expect(result.callType).toBe("video");
      }
    });

    it("returns glare when hasActiveCall is true for the caller", async () => {
      const deps = makeDeps({ hasActiveCall: jest.fn().mockReturnValue(true) });
      const router = new CallMessageRouter(deps);

      const result = await router.handle(makeVideoCall("peer-2"));

      expect(result.action).toBe("glare");
      if (result.action === "glare") {
        expect(result.peerId).toBe("peer-2");
        expect(result.eventName).toBe("video-call");
      }
    });

    it("returns emit with video-call event for normal incoming call", async () => {
      const deps = makeDeps();
      const router = new CallMessageRouter(deps);

      const result = await router.handle(makeVideoCall("peer-2"));

      expect(result.action).toBe("emit");
      if (result.action === "emit") {
        expect(result.eventName).toBe("video-call");
        expect(result.payload).toMatchObject({ peerId: "peer-2", callerName: "Bob" });
      }
    });
  });

  describe("call-ended", () => {
    it("returns emit with call-ended event", async () => {
      const deps = makeDeps();
      const router = new CallMessageRouter(deps);

      const result = await router.handle(makeCallEnded("peer-1"));

      expect(result.action).toBe("emit");
      if (result.action === "emit") {
        expect(result.eventName).toBe("call-ended");
        expect(result.payload).toMatchObject({ peerId: "peer-1", status: "completed" });
      }
    });

    it("passes callId through to the payload", async () => {
      const deps = makeDeps();
      const router = new CallMessageRouter(deps);
      const message: CallEndedMessage = {
        type: "call-ended",
        data: { from: "peer-1", to: "me", status: "completed", callType: "audio", callId: "call-abc" },
      };

      const result = await router.handle(message);

      expect(result.action).toBe("emit");
      if (result.action === "emit") {
        expect((result.payload as { callId: string }).callId).toBe("call-abc");
      }
    });
  });

  describe("call-ready", () => {
    it("returns emit with call-ready event", async () => {
      const deps = makeDeps();
      const router = new CallMessageRouter(deps);

      const result = await router.handle(makeCallReady("peer-1"));

      expect(result.action).toBe("emit");
      if (result.action === "emit") {
        expect(result.eventName).toBe("call-ready");
        expect(result.payload).toBe("peer-1");
      }
    });
  });

  describe("call-rejected", () => {
    it("returns emit with call-busy event when reason is busy", async () => {
      const deps = makeDeps();
      const router = new CallMessageRouter(deps);

      const result = await router.handle(makeCallRejectedBusy("peer-1"));

      expect(result.action).toBe("emit");
      if (result.action === "emit") {
        expect(result.eventName).toBe("call-busy");
        expect(result.payload).toMatchObject({ peerId: "peer-1" });
      }
    });

    it("returns noop when reason is not busy", async () => {
      const deps = makeDeps();
      const router = new CallMessageRouter(deps);

      const result = await router.handle(makeCallRejectedDeclined("peer-1"));

      expect(result.action).toBe("noop");
    });
  });

  describe("unrecognized message type", () => {
    it("returns noop for unrecognized call message type", async () => {
      const deps = makeDeps();
      const router = new CallMessageRouter(deps);

      const unknown = { type: "call-missed", data: { from: "peer-1", to: "me" } } as CallMessage;
      const result = await router.handle(unknown);

      expect(result.action).toBe("noop");
    });
  });
});
