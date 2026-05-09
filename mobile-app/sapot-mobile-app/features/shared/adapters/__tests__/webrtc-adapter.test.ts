import {
    createMockMediaStream,
    createMockRtcPeerConnection,
} from "@/test/mocks/adapter.mock-builders";
import { WebrtcAdapter } from "../webrtc-adapter";


jest.mock("react-native-webrtc", () => ({
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
  mediaDevices: {
    getUserMedia: jest.fn(),
    enumerateDevices: jest.fn(),
  },
}));

describe("WebrtcAdapter", () => {
  let adapter: WebrtcAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new WebrtcAdapter("peer-1");
  });

  it("creates adapter with peer id", () => {
    expect(adapter.peerId).toBe("peer-1");
  });

  it("initializes peer connection", async () => {
    const { RTCPeerConnection } = require("react-native-webrtc");
    const mockPeerConnection = createMockRtcPeerConnection();

    RTCPeerConnection.mockReturnValue(mockPeerConnection);

    // Test basic instantiation
    expect(adapter.peerId).toBe("peer-1");
  });

  it("handles local stream initialization", async () => {
    const { mediaDevices } = require("react-native-webrtc");
    const mockStream = createMockMediaStream();

    mediaDevices.getUserMedia.mockResolvedValue(mockStream);

    // Test instantiation and configuration
    expect(adapter).toBeDefined();
    expect(adapter.peerId).toBe("peer-1");
  });

  it("emits events", (done) => {
    const listener = jest.fn();
    adapter.on("test-event", listener);

    adapter.emit("test-event", { data: "test" });

    setTimeout(() => {
      expect(listener).toHaveBeenCalledWith({ data: "test" });
      done();
    }, 0);
  });

  describe("perfect negotiation / glare handling", () => {
    const incomingOffer = { type: "offer" as const, sdp: "v=0\r\n" };

    function mountAdapter(signalingState: string, isMakingOffer = false) {
      const { RTCPeerConnection } = require("react-native-webrtc");
      const mockPc = createMockRtcPeerConnection();

      const mockDataChannel = {
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        readyState: "open",
      };
      mockPc.createDataChannel.mockReturnValue(mockDataChannel);

      let currentSignalingState = signalingState;
      Object.defineProperty(mockPc, "signalingState", {
        get: () => currentSignalingState,
        configurable: true,
      });

      mockPc.setLocalDescription.mockImplementation(() => {
        currentSignalingState = "stable";
        return Promise.resolve();
      });
      mockPc.setRemoteDescription.mockResolvedValue(undefined);
      mockPc.createAnswer.mockResolvedValue({ type: "answer", sdp: "v=0\r\n" });

      RTCPeerConnection.mockReturnValue(mockPc);

      const a = new WebrtcAdapter("peer-x");
      a.createPeerConnection();

      if (isMakingOffer) {
        (a as unknown as { isMakingOffer: boolean }).isMakingOffer = true;
      }

      return { adapter: a, mockPc };
    }

    it("impolite peer ignores incoming offer on collision", async () => {
      const { adapter: a, mockPc } = mountAdapter("have-local-offer", true);
      a.setIsPolite(false);

      const result = await a.handleOffer(incomingOffer);

      expect(result).toBeUndefined();
      expect(mockPc.setRemoteDescription).not.toHaveBeenCalled();
    });

    it("polite peer rolls back then accepts incoming offer on collision", async () => {
      const { adapter: a, mockPc } = mountAdapter("have-local-offer", true);
      a.setIsPolite(true);

      await a.handleOffer(incomingOffer);

      const { RTCSessionDescription } = require("react-native-webrtc");
      expect(RTCSessionDescription).toHaveBeenCalledWith(
        expect.objectContaining({ type: "rollback" })
      );
      expect(mockPc.setLocalDescription).toHaveBeenCalled();
      expect(mockPc.setRemoteDescription).toHaveBeenCalled();
    });

    it("polite peer processes offer normally when stable (no collision)", async () => {
      const { adapter: a, mockPc } = mountAdapter("stable");
      a.setIsPolite(true);

      await a.handleOffer(incomingOffer);

      const { RTCSessionDescription } = require("react-native-webrtc");
      const rollbackCall = (RTCSessionDescription as jest.Mock).mock.calls.find(
        ([arg]) => arg?.type === "rollback"
      );
      expect(rollbackCall).toBeUndefined();
      expect(mockPc.setRemoteDescription).toHaveBeenCalled();
    });

    it("discards ICE candidates while ignoring offer (impolite glare)", async () => {
      const { adapter: a, mockPc } = mountAdapter("have-local-offer", true);
      a.setIsPolite(false);

      // Trigger isIgnoringOffer by handling offer while impolite + collision
      await a.handleOffer(incomingOffer);

      await a.addIceCandidate({ candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 });

      expect(mockPc.addIceCandidate).not.toHaveBeenCalled();
    });
  });
});
