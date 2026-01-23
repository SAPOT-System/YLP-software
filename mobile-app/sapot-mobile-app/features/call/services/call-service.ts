import { ConnectionService, UserStore } from "@/features/shared";
import { EventEmitter } from "events";
// TODO: probably store the peerId state
/**
 * This class is capable of managing call connection
 */
export class CallService extends EventEmitter {
  constructor(
    private connectionService: ConnectionService,
    private userStore: UserStore
  ) {
    super();
  }

  // This method will assume that tcp and webrtc connection is good
  async startCall(peerId: string) {
    try {
      this.listenToRemoteStream();
      // Initialize local audio and video
      await this.connectionService.initializeStream(peerId);

      // Renegotiate the webrtc to include the audio and video
      await this.connectionService.renegotiate(peerId);
    } catch (error) {
      console.warn("[CallService]: Error starting audio call:", error);
      throw error;
    }
  }

  listenToRemoteStream() {
    this.connectionService.on("remoteStream", (stream) => {
      this.emit("remoteStream", stream);
    });
  }

  // Inform peer for incoming call
  informPeerForIncomingAudioCall(peerId: string) {
    this.connectionService.sendMessage(peerId, {
      type: "audio-call",
      data: { senderId: this.userStore.user.id },
    });
  }

  async terminateCallConnection(peerId: string) {
    this.connectionService.terminateCallConnection(peerId);
    await this.connectionService.renegotiate(peerId);
    this.connectionService.sendMessage(peerId, {
      type: "call-ended",
      data: { senderId: this.userStore.user.id },
    });
  }

  toggleMic(peerId: string) {
    try {
      this.connectionService.toggleMic(peerId);
    } catch (error) {
      throw error;
    }
  }

  toggleCamera(peerId: string) {
    try {
      this.connectionService.toggleCamera(peerId);
    } catch (error) {
      throw error;
    }
  }

  getLocalCam(peerId: string) {
    try {
      return this.connectionService.getLocalStream(peerId);
    } catch (error) {
      throw error;
    }
  }
}
