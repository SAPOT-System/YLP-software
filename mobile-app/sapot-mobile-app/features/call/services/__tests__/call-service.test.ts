import { callLog } from "@/features/shared/core/utils/logger";
import { createTestPeer } from "@/test/factories/user.factory";
import { createMockMediaStream } from "@/test/mocks/adapter.mock-builders";
import { createCallServiceDependencyMocks } from "@/test/mocks/service.mock-builders";
import { MediaStream } from "react-native-webrtc";
import { CallService } from "../call-service";

describe("CallService", () => {
  let callService: CallService;
  let mockWebrtcAdapter: {
    setIsPolite: jest.Mock;
  };
  let mockConnectionService: ReturnType<
    typeof createCallServiceDependencyMocks
  >["connectionService"];
  let mockUserStore: ReturnType<
    typeof createCallServiceDependencyMocks
  >["userStore"];
  let mockPeerService: ReturnType<
    typeof createCallServiceDependencyMocks
  >["peerService"];
  let mockCallRepository: ReturnType<
    typeof createCallServiceDependencyMocks
  >["callRepository"];
  let mockCallParticipantRepository: ReturnType<
    typeof createCallServiceDependencyMocks
  >["callParticipantRepository"];
  let mockChatService: ReturnType<
    typeof createCallServiceDependencyMocks
  >["chatService"];
  let mockMessageRepository: { queryMessageById: jest.Mock; saveMessage: jest.Mock };
  let mockMessageStatusRepository: { queryMessageStatusByMessage: jest.Mock; updateMessageStatusByMessage: jest.Mock; saveMessageStatus: jest.Mock };
  let mockConversationKeyManager: { deriveAndSetConversationKey: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createCallServiceDependencyMocks();
    mockWebrtcAdapter = {
      setIsPolite: jest.fn(),
    };
    mockConnectionService = mocks.connectionService;
    mockConnectionService.getWebrtcAdapter.mockReturnValue(mockWebrtcAdapter);
    mockUserStore = mocks.userStore;
    mockPeerService = mocks.peerService;
    mockCallRepository = mocks.callRepository;
    mockCallParticipantRepository = mocks.callParticipantRepository;
    mockChatService = mocks.chatService;

    mockPeerService.findPeerById.mockResolvedValue(
      createTestPeer({
        id: "peer-1",
        username: "peeruser",
      })
    );
    mockPeerService.getOrCreatePeerById.mockResolvedValue(
      createTestPeer({
        id: "peer-1",
        username: "peeruser",
      })
    );
    mockChatService.getOrCreateDirectConversationByPeer.mockResolvedValue({
      id: "conv-1",
    });
    mockCallRepository.saveCall.mockResolvedValue({ id: "call-1" });
    mockCallRepository.updateCallStatus.mockResolvedValue(undefined);
    mockCallParticipantRepository.saveCallParticipant.mockResolvedValue({
      id: "participant-1",
    });
    mockCallParticipantRepository.updateParticipantLeftAtByCallAndUser.mockResolvedValue(
      undefined
    );
    mockChatService.updateMessageStatus.mockResolvedValue(undefined);

    mockMessageRepository = {
      queryMessageById: jest.fn().mockResolvedValue(undefined),
      saveMessage: jest.fn().mockResolvedValue({ id: "mock-message-id" }),
    };
    mockMessageStatusRepository = {
      queryMessageStatusByMessage: jest.fn().mockResolvedValue(undefined),
      updateMessageStatusByMessage: jest.fn().mockResolvedValue(undefined),
      saveMessageStatus: jest.fn().mockResolvedValue(undefined),
    };
    mockConversationKeyManager = {
      deriveAndSetConversationKey: jest.fn().mockResolvedValue(undefined),
    };

    // Create service instance
    callService = new CallService(
      mockConnectionService,
      mockUserStore,
      mockPeerService,
      mockCallRepository as never,
      mockCallParticipantRepository as never,
      mockChatService as never,
      { syncNow: jest.fn().mockResolvedValue(undefined) },
      mockMessageRepository as never,
      mockMessageStatusRepository as never,
      mockConversationKeyManager as never,
    );
  });

  // Drive the connection-service `remoteStream` event the service subscribes to
  // in its constructor.
  const emitRemoteStream = (stream: MediaStream) => {
    const registration = mockConnectionService.on.mock.calls.find(
      ([event]) => event === "remoteStream"
    );
    if (!registration) throw new Error("no remoteStream listener registered");
    (registration[1] as (s: MediaStream) => void)(stream);
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.resetModules();
    jest.dontMock("@/features/shared");
  });

  describe("constructor", () => {
    it("should initialize with provided dependencies", () => {
      expect(callService).toBeInstanceOf(CallService);
    });

    it("should extend EventEmitter", () => {
      expect(callService.on).toBeDefined();
      expect(callService.emit).toBeDefined();
      expect(callService.removeListener).toBeDefined();
    });

    it("should start with disconnected state", async () => {
      // Test that multiple startCall calls work properly (tests initial state)
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      await expect(callService.startCall("audio", "peer-1")).resolves.toBe(
        undefined
      );
    });
  });

  describe("startCall", () => {
    it("should start a call successfully for first time", async () => {
      const peerId = "peer-1";
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);

      await callService.startCall("audio", peerId);

      expect(mockConnectionService.on).toHaveBeenCalledWith(
        "remoteStream",
        expect.any(Function)
      );
      expect(mockConnectionService.initializeStream).toHaveBeenCalledWith(
        "audio",
        peerId
      );
      expect(mockConnectionService.renegotiate).toHaveBeenCalledWith(peerId);
    });

    it("tracks connected state per-peer so startCall for a new peer is not skipped", async () => {
      // Arrange: startCall for peer-1 sets its state to "connected"
      mockConnectionService.isWebrtcConnected.mockReturnValue(true);
      await callService.startCall("audio", "peer-1");
      jest.clearAllMocks();

      // Act: startCall for peer-2 — WebRTC also reports as connected
      mockConnectionService.isWebrtcConnected.mockReturnValue(true);
      await callService.startCall("audio", "peer-2");

      // Assert: peer-2 media init was NOT skipped
      // (with a global flag, peer-2 would early-return because peer-1 set connectedState = "connected")
      expect(mockConnectionService.initializeStream).toHaveBeenCalledWith("audio", "peer-2");
    });

    it("should not start call if already connected", async () => {
      const peerId = "peer-1";

      // Start call once to set connected state
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      await callService.startCall("audio", peerId);
      jest.clearAllMocks();

      mockConnectionService.isWebrtcConnected.mockReturnValue(true);

      // Try to start again
      await callService.startCall("audio", peerId);

      expect(mockConnectionService.initializeStream).not.toHaveBeenCalled();
      expect(mockConnectionService.renegotiate).not.toHaveBeenCalled();
    });

    it("should handle errors during call initialization", async () => {
      const peerId = "peer-1";
      const error = new Error("Stream initialization failed");

      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      mockConnectionService.initializeStream.mockRejectedValue(error);

      await expect(callService.startCall("audio", peerId)).rejects.toThrow(
        "Stream initialization failed"
      );
    });

    it("should handle errors during renegotiation", async () => {
      const peerId = "peer-1";
      const error = new Error("Renegotiation failed");

      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      mockConnectionService.renegotiate.mockRejectedValue(error);

      await expect(callService.startCall("audio", peerId)).rejects.toThrow(
        "Renegotiation failed"
      );
    });
  });

  describe("remoteStream forwarding", () => {
    it("should register remoteStream listener in constructor", () => {
      expect(mockConnectionService.on).toHaveBeenCalledWith(
        "remoteStream",
        expect.any(Function)
      );
    });

    it("should register switch-cam listener in constructor", () => {
      expect(mockConnectionService.on).toHaveBeenCalledWith(
        "switch-cam",
        expect.any(Function)
      );
    });

    // The event fires once and is never replayed, so the UI needs to be able to
    // ask for the stream after the fact — it can mount or reset after the media
    // has already landed.
    it("retains the forwarded stream for later retrieval", () => {
      const stream = createMockMediaStream();
      emitRemoteStream(stream);

      expect(callService.getRemoteStream()).toBe(stream);
    });

    it("holds no stream before any has arrived", () => {
      expect(callService.getRemoteStream()).toBeNull();
    });

    it("drops the retained stream when the call is terminated", async () => {
      await callService.startCall("audio", "peer-1");
      emitRemoteStream(createMockMediaStream());

      await callService.terminateCallConnection("peer-1");

      expect(callService.getRemoteStream()).toBeNull();
    });

    it("drops a stream left over from a previous call when a new one starts", async () => {
      emitRemoteStream(createMockMediaStream());

      await callService.informPeerForIncomingCall("audio", "peer-1");

      expect(callService.getRemoteStream()).toBeNull();
    });
  });

  describe("informPeerForIncomingCall", () => {
    it("prepares signaling and sends the invite without starting WebRTC", async () => {
      const peerId = "peer-1";

      await callService.informPeerForIncomingCall("audio", peerId);

      expect(mockConnectionService.prepareCallSignaling).toHaveBeenCalledWith(
        peerId
      );
      expect(mockConnectionService.connectToPeer).not.toHaveBeenCalled();
      expect(mockConnectionService.initializeStreamEarly).toHaveBeenCalledWith(
        "audio",
        peerId
      );
      expect(mockConnectionService.sendCallMessage).toHaveBeenCalledWith(
        peerId,
        expect.objectContaining({
          type: "audio-call",
          data: expect.objectContaining({ from: "test-user-id", to: peerId }),
        })
      );
    });

    it("throws when sending the call invitation fails", async () => {
      const peerId = "peer-1";
      mockConnectionService.sendCallMessage.mockImplementation(() => {
        throw new Error("Send failed");
      });

      await expect(
        callService.informPeerForIncomingCall("audio", peerId)
      ).rejects.toThrow("Send failed");
    });

    it("still sends the call invitation if early stream init fails", async () => {
      const peerId = "peer-1";
      mockConnectionService.initializeStreamEarly.mockRejectedValue(
        new Error("camera denied")
      );

      await callService.informPeerForIncomingCall("audio", peerId);

      expect(mockConnectionService.sendCallMessage).toHaveBeenCalledWith(
        peerId,
        expect.objectContaining({ type: "audio-call" })
      );
    });

    it("starts WebRTC exactly once for the matching call-ready without a UI listener", async () => {
      const peerId = "peer-1";
      const startSpy = jest
        .spyOn(callService, "startCall")
        .mockResolvedValue(undefined);

      await callService.informPeerForIncomingCall("audio", peerId);
      const registration = mockConnectionService.on.mock.calls.find(
        ([event]) => event === "call-ready"
      );
      const handler = registration?.[1] as
        | ((payload: { peerId: string; callId: string }) => void)
        | undefined;

      handler?.({ peerId, callId: "stale-call" });
      expect(startSpy).not.toHaveBeenCalled();

      handler?.({ peerId, callId: "call-1" });
      await Promise.resolve();
      await Promise.resolve();

      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(startSpy).toHaveBeenCalledWith("audio", peerId);
      expect(mockConnectionService.off).toHaveBeenCalledWith(
        "call-ready",
        handler
      );
    });
  });

  describe("terminateCallConnection", () => {
    beforeEach(async () => {
      // Start a call first to set connected state
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      await callService.startCall("audio", "peer-1");
      jest.clearAllMocks();

      mockConnectionService.isWebrtcConnected.mockReturnValue(true);
    });

    it("should terminate call successfully", async () => {
      const peerId = "peer-1";
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);

      await callService.terminateCallConnection(peerId);

      expect(
        mockConnectionService.terminateCallConnection
      ).toHaveBeenCalledWith(peerId);
      expect(mockConnectionService.renegotiate).not.toHaveBeenCalled();
      expect(mockConnectionService.sendCallMessage).toHaveBeenCalledWith(
        peerId,
        expect.objectContaining({
          type: "call-ended",
          data: expect.objectContaining({
            from: "test-user-id",
            to: peerId,
          }),
        })
      );
      expect(mockMessageRepository.saveMessage).toHaveBeenCalled();
    });

    it("tears down an active call attempt that never reached connected", async () => {
      const peerId = "peer-2";
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      await callService.informPeerForIncomingCall("audio", peerId);
      jest.clearAllMocks();

      await callService.terminateCallConnection(peerId, "missed");

      expect(
        mockConnectionService.terminateCallConnection
      ).toHaveBeenCalledWith(peerId);
    });

    it("should not terminate if already disconnected", async () => {
      const peerId = "peer-1";
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);

      // Terminate once to set disconnected state
      await callService.terminateCallConnection(peerId);
      jest.clearAllMocks();

      // Try to terminate again
      await callService.terminateCallConnection(peerId);

      expect(
        mockConnectionService.terminateCallConnection
      ).not.toHaveBeenCalled();
      expect(mockConnectionService.renegotiate).not.toHaveBeenCalled();
      expect(mockConnectionService.sendCallMessage).toHaveBeenCalledWith(
        peerId,
        expect.objectContaining({
          type: "call-ended",
          data: expect.objectContaining({
            from: "test-user-id",
            to: peerId,
          }),
        })
      );
    });

    it("should include callId in the call-ended message", async () => {
      const peerId = "peer-1";
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);

      await callService.terminateCallConnection(peerId);

      expect(mockConnectionService.sendCallMessage).toHaveBeenCalledWith(
        peerId,
        expect.objectContaining({
          type: "call-ended",
          data: expect.objectContaining({
            callId: "call-1",
          }),
        })
      );
    });

    it("should handle errors during termination", async () => {
      const peerId = "peer-1";
      const error = new Error("Termination failed");

      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      mockConnectionService.terminateCallConnection.mockImplementation(() => {
        throw error;
      });

      await expect(callService.terminateCallConnection(peerId)).rejects.toThrow(
        "Termination failed"
      );
    });

    it("should handle errors when notifying peer during termination", async () => {
      const peerId = "peer-1";
      const error = new Error("Renegotiation failed");

      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      mockConnectionService.sendCallMessage.mockImplementation(() => {
        throw error;
      });

      await expect(callService.terminateCallConnection(peerId)).rejects.toThrow(
        "Renegotiation failed"
      );
    });
  });

  describe("toggleMic", () => {
    it("should toggle microphone for peer", () => {
      const peerId = "peer-1";
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);

      callService.toggleMic(peerId);

      expect(mockConnectionService.toggleMic).toHaveBeenCalledWith(peerId);
    });

    it("should throw errors when toggling mic fails", () => {
      const peerId = "peer-1";
      const error = new Error("Toggle mic failed");

      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      mockConnectionService.toggleMic.mockImplementation(() => {
        throw error;
      });

      expect(() => callService.toggleMic(peerId)).toThrow("Toggle mic failed");
    });
  });

  describe("toggleCamera", () => {
    it("should toggle camera for peer", async () => {
      const peerId = "peer-1";
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);

      await callService.toggleCamera(peerId);

      expect(mockConnectionService.toggleCamera).toHaveBeenCalledWith(peerId);
    });

    it("should throw errors when toggling camera fails", async () => {
      const peerId = "peer-1";
      const error = new Error("Toggle camera failed");

      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      mockConnectionService.toggleCamera.mockImplementation(() => {
        throw error;
      });

      await expect(callService.toggleCamera(peerId)).rejects.toThrow(
        "Toggle camera failed"
      );
    });
  });

  describe("getLocalCam", () => {
    it("should return local stream for peer", () => {
      const peerId = "peer-1";
      const mockStream = createMockMediaStream("local-stream") as MediaStream;

      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      mockConnectionService.getLocalStream.mockReturnValue(mockStream);

      const result = callService.getLocalCam(peerId);

      expect(mockConnectionService.getLocalStream).toHaveBeenCalledWith(peerId);
      expect(result).toBe(mockStream);
    });

    it("should throw errors when getting local camera fails", () => {
      const peerId = "peer-1";
      const error = new Error("Get local stream failed");

      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      mockConnectionService.getLocalStream.mockImplementation(() => {
        throw error;
      });

      expect(() => callService.getLocalCam(peerId)).toThrow(
        "Get local stream failed"
      );
    });

    it("should return undefined if no stream available", () => {
      const peerId = "peer-1";

      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      mockConnectionService.getLocalStream.mockReturnValue(
        undefined as unknown as MediaStream
      );

      const result = callService.getLocalCam(peerId);

      expect(result).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("should log errors with peer ID context", async () => {
      const logSpy = jest.spyOn(callLog, "error");
      const peerId = "peer-1";
      const error = new Error("Test error");

      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      mockConnectionService.initializeStream.mockRejectedValue(error);

      try {
        await callService.startCall("audio", peerId);
      } catch {
        // Expected to throw
      }

      expect(logSpy).toHaveBeenCalledWith(
        "call › starting call failed",
        expect.objectContaining({ peerId, cause: error })
      );
    });

    it("should maintain proper error context for all methods", () => {
      const logSpy = jest.spyOn(callLog, "error");
      const peerId = "peer-1";

      // Test error handling for synchronous methods
      const micError = new Error("Mic error");

      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      mockConnectionService.toggleMic.mockImplementation(() => {
        throw micError;
      });

      expect(() => callService.toggleMic(peerId)).toThrow("Mic error");

      expect(logSpy).toHaveBeenCalledWith(
        "call › mic toggle failed",
        expect.objectContaining({ peerId, cause: micError })
      );
    });
  });

  describe("state management", () => {
    it("should properly track connected state through call lifecycle", async () => {
      const peerId = "peer-1";

      // Should start disconnected
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      await callService.startCall("audio", peerId);
      expect(mockConnectionService.initializeStream).toHaveBeenCalledTimes(1);

      // Should be connected now
      jest.clearAllMocks();
      mockConnectionService.isWebrtcConnected.mockReturnValue(true);
      await callService.startCall("audio", peerId);
      expect(mockConnectionService.initializeStream).not.toHaveBeenCalled();

      // Should terminate properly
      await callService.terminateCallConnection(peerId);
      expect(
        mockConnectionService.terminateCallConnection
      ).toHaveBeenCalledTimes(1);

      // Should be disconnected now
      jest.clearAllMocks();
      await callService.terminateCallConnection(peerId);
      expect(
        mockConnectionService.terminateCallConnection
      ).not.toHaveBeenCalled();

      // Should be able to start again
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      await callService.startCall("audio", peerId);
      expect(mockConnectionService.initializeStream).toHaveBeenCalledTimes(1);
    });
  });

  describe("handleIncomingBusyReject", () => {
    const peerId = "peer-1";

    async function getBusyRejectHandler() {
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      await callService.informPeerForIncomingCall("audio", peerId);
      const callBusyCall = mockConnectionService.on.mock.calls
        .slice()
        .reverse()
        .find((call: [string, ...unknown[]]) => call[0] === "call-busy");
      return callBusyCall?.[1] as
        | ((
            busyPeerId: string,
            payload: {
              callId: string;
              conversationId: string;
              messageId?: string;
              callType: "audio" | "video";
            }
          ) => Promise<void>)
        | undefined;
    }

    it("should ignore busy logs when glare was accepted locally", async () => {
      mockConnectionService.shouldIgnoreCallBusy.mockReturnValue(true);

      const handler = await getBusyRejectHandler();
      expect(handler).toBeDefined();

      await handler?.(peerId, {
        callId: "call-abc",
        conversationId: "conv-1",
        callType: "audio",
      });

      expect(mockCallRepository.updateCallStatus).not.toHaveBeenCalled();
      expect(mockMessageRepository.saveMessage).not.toHaveBeenCalled();
    });

    it("should skip busy log when caller has an outgoing session (glare)", async () => {
      const handler = await getBusyRejectHandler();
      expect(handler).toBeDefined();

      await handler?.(peerId, {
        callId: "call-abc",
        conversationId: "conv-1",
        callType: "audio",
      });

      expect(mockCallRepository.updateCallStatus).not.toHaveBeenCalled();
      expect(mockMessageRepository.saveMessage).not.toHaveBeenCalled();
    });
  });

  describe("answerCall", () => {
    const peerId = "peer-1";

    it("sends correlated call-ready before waiting for WebRTC", async () => {
      const callOrder: string[] = [];
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      mockConnectionService.initializeStreamEarly.mockImplementation(async () => {
        callOrder.push("initializeStreamEarly");
      });
      mockConnectionService.sendCallMessage.mockImplementation(
        (_id: string, msg: { type: string }) => {
          if (msg.type === "call-ready") callOrder.push("call-ready");
        }
      );
      mockConnectionService.waitForDataChannel.mockImplementation(async () => {
        callOrder.push("waitForDataChannel");
      });
      mockConnectionService.initializeStream.mockImplementation(async () => {
        callOrder.push("initializeStream");
      });

      await callService.answerCall("audio", peerId, "conv-1", "call-1");

      expect(mockConnectionService.sendCallMessage).toHaveBeenCalledWith(
        peerId,
        {
          type: "call-ready",
          data: {
            from: "test-user-id",
            to: peerId,
            callId: "call-1",
          },
        }
      );
      expect(callOrder).toEqual([
        "initializeStreamEarly",
        "call-ready",
        "waitForDataChannel",
        "initializeStream",
      ]);
    });

    it("does not accept the call when early media initialization fails", async () => {
      mockConnectionService.initializeStreamEarly.mockRejectedValue(
        new Error("Microphone unavailable")
      );

      await expect(
        callService.answerCall("audio", peerId, "conv-1", "call-1")
      ).rejects.toThrow();

      expect(mockConnectionService.sendCallMessage).not.toHaveBeenCalledWith(
        peerId,
        expect.objectContaining({ type: "call-ready" })
      );
    });

    it("has already accepted before a data-channel timeout", async () => {
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      mockConnectionService.waitForDataChannel.mockRejectedValue(
        new Error("Data channel timeout")
      );

      await expect(
        callService.answerCall("audio", peerId, "conv-1", "call-1")
      ).rejects.toThrow();

      expect(mockConnectionService.sendCallMessage).toHaveBeenCalledWith(
        peerId,
        expect.objectContaining({
          type: "call-ready",
          data: expect.objectContaining({ callId: "call-1" }),
        })
      );
    });

    it("skips waitForDataChannel when already connected", async () => {
      mockConnectionService.isWebrtcConnected.mockReturnValue(true);

      await callService.answerCall("audio", peerId, "conv-1", "call-1");

      expect(mockConnectionService.waitForDataChannel).not.toHaveBeenCalled();
      expect(mockConnectionService.initializeStream).toHaveBeenCalledWith(
        "audio",
        peerId
      );
    });
  });

  describe("handleRemoteCallEnded", () => {
    beforeEach(async () => {
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      await callService.answerCall("audio", "peer-1", "conv-1", "call-1");
      jest.clearAllMocks();
    });

    it("clears the active call state so the next incoming call is not routed as glare", async () => {
      await callService.handleRemoteCallEnded("peer-1", {
        status: "completed",
        endedAt: Date.now(),
        durationSeconds: 10,
        initiatorId: "peer-1",
        callType: "audio",
      });

      expect(mockConnectionService.setActiveCall).toHaveBeenCalledWith(null);
    });

    it("tears down an active call attempt when the peer ends it before connection", async () => {
      const peerId = "peer-2";
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      await callService.informPeerForIncomingCall("audio", peerId);
      jest.clearAllMocks();

      await callService.handleRemoteCallEnded(peerId, {
        status: "missed",
        endedAt: Date.now(),
        durationSeconds: 0,
        initiatorId: "test-user-id",
        callType: "audio",
      });

      expect(
        mockConnectionService.terminateCallConnection
      ).toHaveBeenCalledWith(peerId);
    });
  });

  describe("getActiveCallId", () => {
    it("returns undefined when no session exists for peer", () => {
      expect(callService.getActiveCallId("unknown-peer")).toBeUndefined();
    });

    it("returns the session callId when a session exists", async () => {
      mockConnectionService.isWebrtcConnected.mockReturnValue(false);
      await callService.startCall("audio", "peer-1");

      expect(callService.getActiveCallId("peer-1")).toBe("call-1");
    });
  });
});
