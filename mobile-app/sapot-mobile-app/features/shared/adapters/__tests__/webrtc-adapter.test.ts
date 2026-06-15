import {
    createMockMediaStream,
    createMockRtcPeerConnection,
} from "@/test/mocks/adapter.mock-builders";
import { WebrtcAdapter } from "../webrtc-adapter";

// Allow per-test control of expo-constants appVariant.
// Variable must start with "mock" so Jest's babel-jest transform allows the
// hoisted factory to close over it.
let mockAppVariant: string | undefined = "production";

jest.mock("expo-constants", () => ({
  __esModule: true,
  get default() {
    return { expoConfig: { extra: { appVariant: mockAppVariant } } };
  },
}));


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

    it("rolls back a stale have-local-offer before creating a fresh offer", async () => {
      const { adapter: a, mockPc } = mountAdapter("have-local-offer");
      mockPc.createOffer.mockResolvedValue({ type: "offer", sdp: "v=0\r\n" });

      const result = await a.createOffer();

      const { RTCSessionDescription } = require("react-native-webrtc");
      expect(RTCSessionDescription).toHaveBeenCalledWith(
        expect.objectContaining({ type: "rollback" })
      );
      expect(result).toEqual({ type: "offer", sdp: "v=0\r\n" });
    });

    it("does not roll back when the PC is already stable", async () => {
      const { adapter: a, mockPc } = mountAdapter("stable");
      mockPc.createOffer.mockResolvedValue({ type: "offer", sdp: "v=0\r\n" });

      await a.createOffer();

      const { RTCSessionDescription } = require("react-native-webrtc");
      const rollbackCall = (RTCSessionDescription as jest.Mock).mock.calls.find(
        ([arg]) => arg?.type === "rollback"
      );
      expect(rollbackCall).toBeUndefined();
    });
  });

  describe("liveness (ping/pong)", () => {
    type MockChannel = {
      onopen: (() => void) | null;
      onmessage: ((e: { data: string }) => void) | null;
      onerror: ((e: unknown) => void) | null;
      onclose: (() => void) | null;
      readyState: string;
      send: jest.Mock;
      close: jest.Mock;
    };
    let mockChannel: MockChannel;
    let a: WebrtcAdapter;

    const sent = () =>
      mockChannel.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw));

    beforeEach(() => {
      jest.useFakeTimers();
      mockChannel = {
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        readyState: "open",
        send: jest.fn(),
        close: jest.fn(),
      };
      a = new WebrtcAdapter("peer-live");
      a.setDataChannel(mockChannel as unknown as Parameters<typeof a.setDataChannel>[0]);
      // Data channel open starts the monitor.
      mockChannel.onopen?.();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it("sends a ping on the configured interval", () => {
      jest.advanceTimersByTime(4000);
      expect(sent().some((m) => m.type === "ping")).toBe(true);
    });

    it("replies to an incoming ping with a pong echoing the nonce", () => {
      mockChannel.onmessage?.({
        data: JSON.stringify({ type: "ping", data: { nonce: 99 } }),
      });
      expect(sent()).toContainEqual({ type: "pong", data: { nonce: 99 } });
    });

    it("does not propagate liveness frames to chat handling", () => {
      const received = jest.fn();
      a.on("receivedMessage", received);
      mockChannel.onmessage?.({
        data: JSON.stringify({ type: "ping", data: { nonce: 1 } }),
      });
      mockChannel.onmessage?.({
        data: JSON.stringify({ type: "pong", data: { nonce: 1 } }),
      });
      expect(received).not.toHaveBeenCalled();
    });

    it("forces an ICE restart after consecutive missed pongs", () => {
      const iceRestarting = jest.fn();
      a.on("ice-restarting", iceRestarting);

      jest.advanceTimersByTime(4000); // ping #1
      jest.advanceTimersByTime(3000); // miss #1
      jest.advanceTimersByTime(4000); // ping #2
      jest.advanceTimersByTime(3000); // miss #2 → liveness lost

      expect(iceRestarting).toHaveBeenCalled();
    });

    it("emits liveness-restored when a pong arrives after degradation", () => {
      const restored = jest.fn();
      a.on("liveness-restored", restored);

      jest.advanceTimersByTime(4000); // ping #1
      jest.advanceTimersByTime(3000); // miss #1
      jest.advanceTimersByTime(4000); // ping #2
      jest.advanceTimersByTime(3000); // miss #2 → degraded

      mockChannel.onmessage?.({
        data: JSON.stringify({ type: "pong", data: { nonce: 2 } }),
      });

      expect(restored).toHaveBeenCalled();
    });

    it("stops probing once the data channel closes", () => {
      mockChannel.onclose?.();
      mockChannel.send.mockClear();
      jest.advanceTimersByTime(20000);
      expect(mockChannel.send).not.toHaveBeenCalled();
    });
  });

  describe("stress-echo handling", () => {
    type MockChannel = {
      onopen: (() => void) | null;
      onmessage: ((e: { data: string }) => void) | null;
      onerror: ((e: unknown) => void) | null;
      onclose: (() => void) | null;
      readyState: string;
      send: jest.Mock;
      close: jest.Mock;
    };
    let mockChannel: MockChannel;
    let a: WebrtcAdapter;

    const echoFrame = JSON.stringify({ type: "stress-echo", seq: 7, sentAt: 1000 });

    function mountWithChannel() {
      jest.useFakeTimers();
      mockChannel = {
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        readyState: "open",
        send: jest.fn(),
        close: jest.fn(),
      };
      a = new WebrtcAdapter("peer-stress");
      a.setDataChannel(mockChannel as unknown as Parameters<typeof a.setDataChannel>[0]);
      mockChannel.onopen?.();
      mockChannel.send.mockClear(); // clear pings from liveness start
    }

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it("replies with stress-ack in development builds", () => {
      mockAppVariant = "development";
      mountWithChannel();

      mockChannel.onmessage?.({ data: echoFrame });

      const sent = mockChannel.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw));
      expect(sent).toContainEqual({ type: "stress-ack", seq: 7, sentAt: 1000 });
    });

    it("replies with stress-ack in preview builds", () => {
      mockAppVariant = "preview";
      mountWithChannel();

      mockChannel.onmessage?.({ data: echoFrame });

      const sent = mockChannel.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw));
      expect(sent).toContainEqual({ type: "stress-ack", seq: 7, sentAt: 1000 });
    });

    it("does not reply in production builds", () => {
      mockAppVariant = "production";
      mountWithChannel();

      mockChannel.onmessage?.({ data: echoFrame });

      const sent = mockChannel.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw));
      expect(sent.some((m: { type: string }) => m.type === "stress-ack")).toBe(false);
    });

    it("does not emit receivedMessage for stress-echo in dev builds", () => {
      mockAppVariant = "development";
      mountWithChannel();
      const received = jest.fn();
      a.on("receivedMessage", received);

      mockChannel.onmessage?.({ data: echoFrame });

      expect(received).not.toHaveBeenCalled();
    });

    it("does not emit receivedMessage for stress-echo in preview builds", () => {
      mockAppVariant = "preview";
      mountWithChannel();
      const received = jest.fn();
      a.on("receivedMessage", received);

      mockChannel.onmessage?.({ data: echoFrame });

      expect(received).not.toHaveBeenCalled();
    });

    it("falls through to receivedMessage in production builds", () => {
      mockAppVariant = "production";
      mountWithChannel();
      const received = jest.fn();
      a.on("receivedMessage", received);

      mockChannel.onmessage?.({ data: echoFrame });

      expect(received).toHaveBeenCalledWith({ type: "stress-echo", seq: 7, sentAt: 1000 });
    });

    it("catches and logs without throwing when channel is closed on reply", () => {
      mockAppVariant = "development";
      mountWithChannel();
      mockChannel.send.mockImplementation(() => { throw new Error("channel closed"); });

      expect(() => {
        mockChannel.onmessage?.({ data: echoFrame });
      }).not.toThrow();
    });
  });
});
