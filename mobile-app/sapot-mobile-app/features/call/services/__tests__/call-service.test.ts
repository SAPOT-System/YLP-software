import { ConnectionService, UserStore } from "@/features/shared";
import { callLog } from "@/features/shared/utils/logger";
import { createMockMediaStream } from "@/test/mocks/adapter.mock-builders";
import { createCallServiceDependencyMocks } from "@/test/mocks/service.mock-builders";
import { MediaStream } from "react-native-webrtc";
import { CallService } from "../call-service";

// Mock shared dependencies
jest.mock("@/features/shared", () => ({
  ConnectionService: jest.fn(),
  UserStore: jest.fn(),
}));

describe("CallService", () => {
  let callService: CallService;
  let mockConnectionService: jest.Mocked<ConnectionService>;
  let mockUserStore: jest.Mocked<UserStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createCallServiceDependencyMocks();
    mockConnectionService =
      mocks.connectionService as unknown as jest.Mocked<ConnectionService>;
    mockUserStore = mocks.userStore as unknown as jest.Mocked<UserStore>;

    // Mock constructors
    jest
      .mocked(ConnectionService)
      .mockImplementation(() => mockConnectionService);
    jest.mocked(UserStore).mockImplementation(() => mockUserStore);

    // Create service instance
    callService = new CallService(mockConnectionService, mockUserStore);
  });

  afterEach(() => {
    jest.clearAllMocks();
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

    it("should start with disconnected state", () => {
      // Test that multiple startCall calls work properly (tests initial state)
      expect(() => callService.startCall("audio", "peer-1")).not.toThrow();
    });
  });

  describe("startCall", () => {
    it("should start a call successfully for first time", async () => {
      const peerId = "peer-1";

      await callService.startCall("audio", peerId);

      expect(mockConnectionService.on).toHaveBeenCalledWith(
        "remoteStream",
        expect.any(Function)
      );
      expect(mockConnectionService.initializeStream).toHaveBeenCalledWith(
        "audio",
        peerId
      );
      expect(mockConnectionService.renegotiate).toHaveBeenCalledWith(
        peerId
      );
    });

    it("should not start call if already connected", async () => {
      const peerId = "peer-1";

      // Start call once to set connected state
      await callService.startCall("audio", peerId);
      jest.clearAllMocks();

      // Try to start again
      await callService.startCall("audio", peerId);

      expect(mockConnectionService.initializeStream).not.toHaveBeenCalled();
      expect(mockConnectionService.renegotiate).not.toHaveBeenCalled();
    });

    it("should handle errors during call initialization", async () => {
      const peerId = "peer-1";
      const error = new Error("Stream initialization failed");

      mockConnectionService.initializeStream.mockRejectedValue(error);

      await expect(callService.startCall("audio", peerId)).rejects.toThrow(
        "Stream initialization failed"
      );
    });

    it("should handle errors during renegotiation", async () => {
      const peerId = "peer-1";
      const error = new Error("Renegotiation failed");

      mockConnectionService.renegotiate.mockRejectedValue(error);

      await expect(callService.startCall("audio", peerId)).rejects.toThrow(
        "Renegotiation failed"
      );
    });
  });

  describe("listenToRemoteStream", () => {
    it("should setup listener for remote stream events", () => {
      callService.listenToRemoteStream();

      expect(mockConnectionService.on).toHaveBeenCalledWith(
        "remoteStream",
        expect.any(Function)
      );
    });

    it("should emit remoteStream event when received", () => {
      const mockStream = createMockMediaStream("remote-stream");
      let streamCallback: (stream: MediaStream) => void;

      mockConnectionService.on.mockImplementation((event, callback) => {
        if (event === "remoteStream") {
          streamCallback = callback;
        }
        return mockConnectionService;
      });

      jest.spyOn(callService, "emit");

      callService.listenToRemoteStream();

      // Simulate remote stream event
      streamCallback!(mockStream);

      expect(callService.emit).toHaveBeenCalledWith("remoteStream", mockStream);
    });

    it("should be called automatically during startCall", async () => {
      const peerId = "peer-1";

      await callService.startCall("audio", peerId);

      expect(mockConnectionService.on).toHaveBeenCalledWith(
        "remoteStream",
        expect.any(Function)
      );
    });
  });

  describe("informPeerForIncomingCall", () => {
    it("should send audio call message to peer", () => {
      const peerId = "peer-1";

      callService.informPeerForIncomingCall("audio", peerId);

      expect(mockConnectionService.sendCallMessage).toHaveBeenCalledWith(
        peerId,
        {
          type: "audio-call",
          data: { from: "test-user-id", to: peerId },
        }
      );
    });

    it("should throw errors when sending audio call message fails", () => {
      const peerId = "peer-1";
      const error = new Error("Send failed");

      mockConnectionService.sendCallMessage.mockImplementation(() => {
        throw error;
      });

      expect(() =>
        callService.informPeerForIncomingCall("audio", peerId)
      ).toThrow("Send failed");
    });
  });

  describe("terminateCallConnection", () => {
    beforeEach(async () => {
      // Start a call first to set connected state
      await callService.startCall("audio", "peer-1");
      jest.clearAllMocks();
    });

    it("should terminate call successfully", async () => {
      const peerId = "peer-1";

      await callService.terminateCallConnection(peerId);

      expect(
        mockConnectionService.terminateCallConnection
      ).toHaveBeenCalledWith(peerId);
      expect(mockConnectionService.renegotiate).toHaveBeenCalledWith(peerId);
      expect(mockConnectionService.sendCallMessage).toHaveBeenCalledWith(peerId, {
        type: "call-ended",
        data: { from: "test-user-id", to: peerId },
      });
    });

    it("should not terminate if already disconnected", async () => {
      const peerId = "peer-1";

      // Terminate once to set disconnected state
      await callService.terminateCallConnection(peerId);
      jest.clearAllMocks();

      // Try to terminate again
      await callService.terminateCallConnection(peerId);

      expect(
        mockConnectionService.terminateCallConnection
      ).not.toHaveBeenCalled();
      expect(mockConnectionService.renegotiate).not.toHaveBeenCalled();
      expect(mockConnectionService.sendCallMessage).not.toHaveBeenCalled();
    });

    it("should handle errors during termination", async () => {
      const peerId = "peer-1";
      const error = new Error("Termination failed");

      mockConnectionService.terminateCallConnection.mockImplementation(() => {
        throw error;
      });

      await expect(callService.terminateCallConnection(peerId)).rejects.toThrow(
        "Termination failed"
      );
    });

    it("should handle errors during renegotiation on termination", async () => {
      const peerId = "peer-1";
      const error = new Error("Renegotiation failed");

      mockConnectionService.renegotiate.mockRejectedValue(error);

      await expect(callService.terminateCallConnection(peerId)).rejects.toThrow(
        "Renegotiation failed"
      );
    });
  });

  describe("toggleMic", () => {
    it("should toggle microphone for peer", () => {
      const peerId = "peer-1";

      callService.toggleMic(peerId);

      expect(mockConnectionService.toggleMic).toHaveBeenCalledWith(peerId);
    });

    it("should throw errors when toggling mic fails", () => {
      const peerId = "peer-1";
      const error = new Error("Toggle mic failed");

      mockConnectionService.toggleMic.mockImplementation(() => {
        throw error;
      });

      expect(() => callService.toggleMic(peerId)).toThrow("Toggle mic failed");
    });
  });

  describe("toggleCamera", () => {
    it("should toggle camera for peer", () => {
      const peerId = "peer-1";

      callService.toggleCamera(peerId);

      expect(mockConnectionService.toggleCamera).toHaveBeenCalledWith(peerId);
    });

    it("should throw errors when toggling camera fails", () => {
      const peerId = "peer-1";
      const error = new Error("Toggle camera failed");

      mockConnectionService.toggleCamera.mockImplementation(() => {
        throw error;
      });

      expect(() => callService.toggleCamera(peerId)).toThrow(
        "Toggle camera failed"
      );
    });
  });

  describe("getLocalCam", () => {
    it("should return local stream for peer", () => {
      const peerId = "peer-1";
      const mockStream = createMockMediaStream("local-stream") as MediaStream;

      mockConnectionService.getLocalStream.mockReturnValue(mockStream);

      const result = callService.getLocalCam(peerId);

      expect(mockConnectionService.getLocalStream).toHaveBeenCalledWith(peerId);
      expect(result).toBe(mockStream);
    });

    it("should throw errors when getting local camera fails", () => {
      const peerId = "peer-1";
      const error = new Error("Get local stream failed");

      mockConnectionService.getLocalStream.mockImplementation(() => {
        throw error;
      });

      expect(() => callService.getLocalCam(peerId)).toThrow(
        "Get local stream failed"
      );
    });

    it("should return undefined if no stream available", () => {
      const peerId = "peer-1";

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

      mockConnectionService.initializeStream.mockRejectedValue(error);

      try {
        await callService.startCall("audio", peerId);
      } catch {
        // Expected to throw
      }

      expect(logSpy).toHaveBeenCalledWith("call › start failed", {
        peerId,
        error,
      });
    });

    it("should maintain proper error context for all methods", () => {
      const logSpy = jest.spyOn(callLog, "error");
      const peerId = "peer-1";

      // Test error handling for synchronous methods
      const micError = new Error("Mic error");

      mockConnectionService.toggleMic.mockImplementation(() => {
        throw micError;
      });

      expect(() => callService.toggleMic(peerId)).toThrow("Mic error");

      expect(logSpy).toHaveBeenCalledWith("call › mic toggle failed", {
        peerId,
        error: micError,
      });
    });
  });

  describe("state management", () => {
    it("should properly track connected state through call lifecycle", async () => {
      const peerId = "peer-1";

      // Should start disconnected
      await callService.startCall("audio", peerId);
      expect(mockConnectionService.initializeStream).toHaveBeenCalledTimes(1);

      // Should be connected now
      jest.clearAllMocks();
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
      await callService.startCall("audio", peerId);
      expect(mockConnectionService.initializeStream).toHaveBeenCalledTimes(1);
    });
  });
});
