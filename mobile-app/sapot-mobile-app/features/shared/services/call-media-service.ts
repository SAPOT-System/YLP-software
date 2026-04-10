import { MediaStream } from "react-native-webrtc";
import { WebrtcAdapter } from "../adapters";

export class CallMediaService {
  private readonly logPrefix = "[CallMediaService]";

  constructor(
    private readonly getWebrtcAdapter: (peerId: string) => WebrtcAdapter
  ) {}

  async initializeStream(stream: "audio" | "video", peerId: string): Promise<void> {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Not connected");
      await webrtcAdapter.initializeLocalStream(true, stream === "video");
    } catch (error) {
      console.error(
        `${this.logPrefix}: Error initializing stream\n${JSON.stringify({ peerId }, null, 2)}\n${error}`
      );
      throw error;
    }
  }

  terminateCallConnection(peerId: string): void {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) return;
      webrtcAdapter.terminateCall();
    } catch (error) {
      console.error(
        `${this.logPrefix}: Error terminating call connection\n${JSON.stringify({ peerId }, null, 2)}\n${error}`
      );
      throw error;
    }
  }

  toggleMic(peerId: string): void {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      webrtcAdapter.toggleMic();
    } catch (error) {
      console.error(
        `${this.logPrefix}: Error toggling mic\n${JSON.stringify({ peerId }, null, 2)}\n${error}`
      );
      throw error;
    }
  }

  toggleCamera(peerId: string): void {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      webrtcAdapter.toggleCamera();
    } catch (error) {
      console.error(
        `${this.logPrefix}: Error toggling camera\n${JSON.stringify({ peerId }, null, 2)}\n${error}`
      );
      throw error;
    }
  }

  getLocalStream(peerId: string): MediaStream {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      return webrtcAdapter.getLocalStream();
    } catch (error) {
      console.error(
        `${this.logPrefix}: Error getting local stream\n${JSON.stringify({ peerId }, null, 2)}\n${error}`
      );
      throw error;
    }
  }
}
