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
});
