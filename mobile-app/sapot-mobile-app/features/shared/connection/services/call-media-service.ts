import { MediaStream } from "react-native-webrtc";
import { WebrtcAdapter } from "../adapters/webrtc-adapter";
import { callLog } from "../../utils/logger";

callLog.debug("[call-media-service] module loaded");

export class CallMediaService {
  constructor(
    private readonly getWebrtcAdapter: (peerId: string) => WebrtcAdapter
  ) {
    callLog.info("call › media service constructed", {
      hasWebrtcAdapter: Boolean(getWebrtcAdapter),
    });
  }

  async initializeStream(
    stream: "audio" | "video",
    peerId: string
  ): Promise<void> {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Not connected");
      await webrtcAdapter.initializeLocalStream(true, stream === "video");
    } catch (error) {
      callLog.error("call › stream init failed", { peerId, error });
      throw error;
    }
  }

  async initializeStreamEarly(
    stream: "audio" | "video",
    peerId: string
  ): Promise<void> {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      await webrtcAdapter.initializeLocalStreamEarly(true, stream === "video");
    } catch (error) {
      callLog.error("call › early stream init failed", { peerId, error });
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

  toggleMic(peerId: string): boolean {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      return webrtcAdapter.toggleMic();
    } catch (error) {
      callLog.error("call › mic toggle failed", { peerId, error });
      throw error;
    }
  }

  async toggleCamera(peerId: string): Promise<boolean> {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      return await webrtcAdapter.toggleCamera();
    } catch (error) {
      callLog.error("call › camera toggle failed", { peerId, error });
      throw error;
    }
  }

  async switchCamera(peerId: string, isFrontCamera: boolean) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      await webrtcAdapter.switchCamera(isFrontCamera);
    } catch (error) {
      callLog.error("call › camera switch failed", { peerId, error });
      throw error;
    }
  }

  getLocalStream(peerId: string): MediaStream {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      return webrtcAdapter.getLocalStream();
    } catch (error) {
      callLog.error("call › get local stream failed", { peerId, error });
      throw error;
    }
  }
}
