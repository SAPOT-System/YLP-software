import { MediaStream } from "react-native-webrtc";
import { WebrtcAdapter } from "../adapters";
import baseLogger from "../utils/logger";

const callLog = baseLogger.extend("call");

export class CallMediaService {
  constructor(
    private readonly getWebrtcAdapter: (peerId: string) => WebrtcAdapter
  ) {}

  async initializeStream(stream: "audio" | "video", peerId: string): Promise<void> {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Not connected");
      await webrtcAdapter.initializeLocalStream(true, stream === "video");
    } catch (error) {
      callLog.error("call › stream init failed", { peerId, error });
      throw error;
    }
  }

  terminateCallConnection(peerId: string): void {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) return;
      webrtcAdapter.terminateCall();
    } catch (error) {
      callLog.error("call › terminate failed", { peerId, error });
      throw error;
    }
  }

  toggleMic(peerId: string): void {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      webrtcAdapter.toggleMic();
    } catch (error) {
      callLog.error("call › mic toggle failed", { peerId, error });
      throw error;
    }
  }

  toggleCamera(peerId: string): void {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      webrtcAdapter.toggleCamera();
    } catch (error) {
      callLog.error("call › camera toggle failed", { peerId, error });
      throw error;
    }
  }

  getLocalStream(peerId: string): MediaStream {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      return webrtcAdapter.getLocalStream();
    } catch (error) {
      callLog.error("call › get local stream failed", { peerId, error });
      throw error;
    }
  }
}
