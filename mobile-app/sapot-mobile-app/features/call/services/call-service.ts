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
      console.error(
        `[CallService]: Error starting call for peer ID of ${peerId}: ${error}`
      );
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
    try {
      this.connectionService.sendMessage(peerId, {
        type: "audio-call",
        data: { senderId: this.userStore.user.id },
      });
    } catch (error) {
      console.error(
        `[CallService]: Error infroming peer for incoming audio call for peer ID of ${peerId}: ${error}`
      );
      throw error;
    }
  }

  async terminateCallConnection(peerId: string) {
    try {
      this.connectionService.terminateCallConnection(peerId);
      await this.connectionService.renegotiate(peerId);
      this.connectionService.sendMessage(peerId, {
        type: "call-ended",
        data: { senderId: this.userStore.user.id },
      });
    } catch (error) {
      console.error(
        `[CallService]: Error terminating call for peer ID of ${peerId}: ${error}`
      );
      throw error;
    }
  }

  toggleMic(peerId: string) {
    try {
      this.connectionService.toggleMic(peerId);
    } catch (error) {
      console.error(
        `[CallService]: Error toggling mic for peer ID of ${peerId}: ${error}`
      );
      throw error;
    }
  }

  toggleCamera(peerId: string) {
    try {
      this.connectionService.toggleCamera(peerId);
    } catch (error) {
      console.error(
        `[CallService]: Error toggling camera for peer ID of ${peerId}: ${error}`
      );
      throw error;
    }
  }

  getLocalCam(peerId: string) {
    try {
      return this.connectionService.getLocalStream(peerId);
    } catch (error) {
      console.error(
        `[CallService]: Error getting local camera for peer ID of ${peerId}: ${error}`
      );
      throw error;
    }
  }
}
