import { ConnectionService, UserStore } from "@/features/shared";
import { EventEmitter } from "events";
// TODO: probably store the peerId state
/**
 * CallService manages call connections, including starting/terminating calls, handling streams,
 * and toggling audio/video for peer-to-peer calls. It extends EventEmitter to emit call-related events.
 */
export class CallService extends EventEmitter {
  private connectedState: "connected" | "disconnected" = "disconnected";
  /**
   * Constructs a CallService instance.
   * @param connectionService Handles network and media stream operations
   * @param userStore Store for user state
   */
  constructor(
    private connectionService: ConnectionService,
    private userStore: UserStore
  ) {
    super();
  }

  /**
   * Starts a call with the given peer. Assumes TCP and WebRTC connections are established.
   * Initializes local media, listens for remote streams, and renegotiates WebRTC.
   * @param peerId The peer id to call
   * @returns Promise<void>
   */
  async startCall(type: "video" | "audio", peerId: string) {
    try {
      if (this.connectedState === "connected") return;
      this.listenToRemoteStream();
      // Initialize local audio and video
      await this.connectionService.initializeStream(type, peerId);

      // Renegotiate the webrtc to include the audio and video
      await this.connectionService.renegotiate(peerId);
      this.connectedState = "connected";
    } catch (error) {
      console.error(
        `[CallService]: Error starting call for peer ID of ${peerId}: ${error}`
      );
      throw error;
    }
  }

  /**
   * Listens for remote media streams from the connection service and emits them to listeners.
   */
  listenToRemoteStream() {
    this.connectionService.on("remoteStream", (stream) => {
      this.emit("remoteStream", stream);
    });
  }

  /**
   * Informs a peer of an incoming audio call by sending a signaling message.
   * @param peerId The peer id to inform
   */
  informPeerForIncomingCall(type: "audio" | "video", peerId: string) {
    try {
      this.connectionService.sendCallMessage(peerId, {
        type: type === "audio" ? "audio-call" : "video-call",
        data: { from: this.userStore.user.id, to: peerId },
      });
    } catch (error) {
      console.error(
        `[CallService]: Error infroming peer for incoming audio call for peer ID of ${peerId}: ${error}`
      );
      throw error;
    }
  }

  /**
   * Terminates the call connection with the given peer, renegotiates WebRTC, and notifies the peer.
   * @param peerId The peer id to terminate the call with
   * @returns Promise<void>
   */
  async terminateCallConnection(peerId: string) {
    try {
      if (this.connectedState === "disconnected") return;
      this.connectionService.terminateCallConnection(peerId);
      await this.connectionService.renegotiate(peerId);
      this.connectionService.sendCallMessage(peerId, {
        type: "call-ended",
        data: { from: this.userStore.user.id, to: peerId },
      });
      this.connectedState = "disconnected";
    } catch (error) {
      console.error(
        `[CallService]: Error terminating call for peer ID of ${peerId}: ${error}`
      );
      throw error;
    }
  }

  /**
   * Toggles the microphone state for the given peer.
   * @param peerId The peer id
   */
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

  /**
   * Toggles the camera state for the given peer.
   * @param peerId The peer id
   */
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

  /**
   * Gets the local camera/media stream for the given peer.
   * @param peerId The peer id
   * @returns The local media stream
   */
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
