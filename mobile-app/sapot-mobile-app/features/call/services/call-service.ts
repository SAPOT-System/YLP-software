import { ConnectionService, PeerService, UserStore } from "@/features/shared";
import { callLog } from "@/features/shared/utils/logger";
import { EventEmitter } from "events";
callLog.debug("[call-service] module loaded");
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
    private userStore: UserStore,
    private peerService: PeerService
  ) {
    super();
    callLog.info("call › service constructed", {
      hasConnectionService: Boolean(connectionService),
      hasUserStore: Boolean(userStore),
    });
  }

  /**
   * Starts a call with the given peer. Assumes TCP and WebRTC connections are established.
   * Initializes local media, listens for remote streams, and renegotiates WebRTC.
   * @param peerId The peer id to call
   * @returns Promise<void>
   */
  async startCall(type: "video" | "audio", peerId: string) {
    try {
      const isWebrtcConnected =
        this.connectionService.isWebrtcConnected(peerId);
      if (this.connectedState === "connected" && isWebrtcConnected) {
        callLog.warn("call › already connected", { peerId, type });
        return;
      }
      callLog.info("call › start", { peerId, type });

      if (!isWebrtcConnected) {
        callLog.info("call › connecting to peer", { peerId, type });
        await this.connect(peerId);
      }

      callLog.info("call › connecting to peer", { peerId, type });
      this.listenToRemoteStream();

      // Initialize local audio and video
      await this.connectionService.initializeStream(type, peerId);

      // Renegotiate the webrtc to include the audio and video
      await this.connectionService.renegotiate(peerId);
      this.connectedState = "connected";
    } catch (error) {
      callLog.error("call › starting call failed", { peerId, error });
      throw error;
    }
  }

  async answerCall(type: "video" | "audio", peerId: string) {
    try {
      if (this.connectedState === "connected") {
        callLog.warn("call › already connected", { peerId, type });
        return;
      }
      callLog.info("call › start answer call", { peerId, type });

      this.connectionService.sendCallMessage(peerId, {
        type: "call-ready",
        data: {
          from: this.userStore.user.id,
          to: peerId,
        },
      });

      // Initialize local audio and video
      await this.connectionService.initializeStream(type, peerId);
      this.listenToRemoteStream();

      this.connectedState = "connected";
    } catch (error) {
      callLog.error("call › answering call failed", { peerId, error });
      throw error;
    }
  }

  async connect(id: string): Promise<void> {
    try {
      callLog.info("call › connect start", { peerId: id });
      try {
        const discoveredPeer = this.peerService.findDiscoveredPeerById(id);

        if (!discoveredPeer) throw new Error("Peer not discovered");

        await this.connectionService.connectToPeer(
          discoveredPeer.id,
          discoveredPeer.ipAddress,
          discoveredPeer.port
        );
      } catch {
        await this.connectionService.connectToPeer(id);
      }
      callLog.info("call › connect complete", { peerId: id });
    } catch (error) {
      callLog.warn("call › connect failed", { peerId: id, error });
      throw error;
    }
  }

  /**
   * Listens for remote media streams from the connection service and emits them to listeners.
   */
  listenToRemoteStream() {
    this.connectionService.on("remoteStream", (stream) => {
      callLog.debug("call › remote stream received");
      this.emit("remoteStream", stream);
    });
  }

  /**
   * Informs a peer of an incoming audio call by sending a signaling message.
   * @param peerId The peer id to inform
   */
  async informPeerForIncomingCall(type: "audio" | "video", peerId: string) {
    try {
      const isWebrtcConnected =
        this.connectionService.isWebrtcConnected(peerId);

      if (!isWebrtcConnected) {
        await this.connect(peerId);
      }
      callLog.info("call › incoming notify", { peerId, type });
      this.connectionService.sendCallMessage(peerId, {
        type: type === "audio" ? "audio-call" : "video-call",
        data: { from: this.userStore.user.id, to: peerId },
      });
    } catch (error) {
      callLog.error("call › incoming notify failed", { peerId, error });
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
      if (this.connectedState === "disconnected") {
        callLog.warn("call › already disconnected", {
          peerId,
        });
        return;
      }
      callLog.info("call › terminate", { peerId });
      this.connectionService.terminateCallConnection(peerId);
      this.connectionService.sendCallMessage(peerId, {
        type: "call-ended",
        data: { from: this.userStore.user.id, to: peerId },
      });
      this.connectedState = "disconnected";
    } catch (error) {
      callLog.error("call › terminate failed", { peerId, error });
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
      callLog.error("call › mic toggle failed", { peerId, error });
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
      callLog.error("call › camera toggle failed", { peerId, error });
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
      callLog.error("call › get local stream failed", { peerId, error });
      throw error;
    }
  }
}
