import { ConnectionService } from "@/features/shared/services/connection-service";
import { PeerService } from "@/features/shared/services/peer-service";
import { UserStore } from "@/features/shared/stores/user-store";
import { callLog } from "@/features/shared/utils/logger";
import { TypedEventEmitter } from "@/features/shared/utils/typed-event-emitter";
import { DeviceEventEmitter } from "react-native";
import InCallManager from "react-native-incall-manager";
import { MediaStream } from "react-native-webrtc";
callLog.debug("[call-service] module loaded");

export type AudioRouteTypes = "earpiece" | "speaker" | "headset" | "bluetooth";

export type CallServiceEvents = {
  "audio-routes-updated": [
    { routes: { type: AudioRouteTypes; label: string }[] }
  ];
  "audio-route-changed": [
    {
      route: AudioRouteTypes;
      available: { type: AudioRouteTypes; label: string }[];
    }
  ];
  remoteStream: [stream: MediaStream];
  "switch-cam": [stream: MediaStream];
};

type CallConnectionService = Pick<
  ConnectionService,
  | "isWebrtcConnected"
  | "initializeStream"
  | "renegotiate"
  | "sendCallMessage"
  | "connectToPeer"
  | "on"
  | "terminateCallConnection"
  | "toggleMic"
  | "toggleCamera"
  | "switchCamera"
  | "getLocalStream"
>;

type CallUserStore = {
  user: Pick<UserStore["user"], "id">;
};

type CallPeerService = Pick<PeerService, "findDiscoveredPeerById">;

// TODO: probably store the peerId state
/**
 * CallService manages call connections, including starting/terminating calls, handling streams,
 * and toggling audio/video for peer-to-peer calls. It extends EventEmitter to emit call-related events.
 */
export class CallService extends TypedEventEmitter<CallServiceEvents> {
  private connectedState: "connected" | "disconnected" = "disconnected";
  private currentAudioRoute: AudioRouteTypes = "speaker";
  private availableRoutes: { type: AudioRouteTypes; label: string }[] = [];
  private isBluetoothConnected = false;
  private isHeadsetConnected = false;
  private initialRouteSetFor: Set<string> = new Set();

  /**
   * Constructs a CallService instance.
   * @param connectionService Handles network and media stream operations
   * @param userStore Store for user state
   */
  constructor(
    private connectionService: CallConnectionService,
    private userStore: CallUserStore,
    private peerService: CallPeerService
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

      callLog.info("call › connecting to peer");

      // For audio-only calls, default to earpiece
      // For video calls, default to speaker
      InCallManager.start({
        media: type,
        auto: true,
      });

      // Force initial route based on call type (only once per call)
      if (!this.initialRouteSetFor.has(peerId)) {
        if (type === "audio") {
          this.setAudioRoute("earpiece");
        } else {
          this.setAudioRoute("speaker");
        }
        this.initialRouteSetFor.add(peerId);
      }

      // Set keep screen on during call
      InCallManager.setKeepScreenOn(true);

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

      // For audio-only calls, default to earpiece
      // For video calls, default to speaker
      InCallManager.start({
        media: type,
        auto: true,
      });

      // Force initial route based on call type (only once per call)
      if (!this.initialRouteSetFor.has(peerId)) {
        if (type === "audio") {
          this.setAudioRoute("earpiece");
        } else {
          this.setAudioRoute("speaker");
        }
        this.initialRouteSetFor.add(peerId);
      }

      // Set keep screen on during call
      InCallManager.setKeepScreenOn(true);

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
        callLog.info("call › connect with ip and port", { peerId: id });

        await this.connectionService.connectToPeer(
          discoveredPeer.id,
          discoveredPeer.ipAddress,
          discoveredPeer.port
        );
      } catch {
        callLog.info("call › connect with no ip and port", { peerId: id });
        await this.connectionService.connectToPeer(id);
      }
      callLog.info("call › connect complete", { peerId: id });
    } catch (error) {
      callLog.warn("call › connect failed", { peerId: id, error });
      throw error;
    }
  }

  setupAudioEventListeners() {
    // Listen for wired headset plug/unplug events
    DeviceEventEmitter.addListener("WiredHeadset", (data) => {
      callLog.info("call › wired headset event:", data);
      this.isHeadsetConnected = data.device === "WiredHeadset";
      this.updateAvailableRoutes();

      // Auto-route to headset if just plugged in
      if (this.isHeadsetConnected) {
        this.setAudioRoute("headset");
      }
    });

    // Listen for Bluetooth headset connection events
    DeviceEventEmitter.addListener("BluetoothHeadset", (data) => {
      callLog.info("call › bluetooth headset event:", data);
      this.isBluetoothConnected = data.device === "BluetoothHeadset";
      this.updateAvailableRoutes();

      // Auto-route to Bluetooth if just connected
      if (this.isBluetoothConnected) {
        this.setAudioRoute("bluetooth");
      }
    });

    // Proximity sensor - auto-switch to earpiece when phone near ear
    DeviceEventEmitter.addListener("Proximity", (data) => {
      if (data.isNear) {
        // Phone near ear - switch to earpiece
        if (
          this.currentAudioRoute !== "earpiece" &&
          this.currentAudioRoute !== "headset" &&
          this.currentAudioRoute !== "bluetooth"
        ) {
          this.setAudioRoute("earpiece");
        }
      } else if (this.currentAudioRoute === "earpiece") {
        // Phone away from ear - restore previous route (speaker if video call)
        // This requires tracking previous route separately
      }
    });
  }

  updateAvailableRoutes() {
    const routes: { type: AudioRouteTypes; label: string }[] = [];

    // Always available
    routes.push({ type: "earpiece", label: "Earpiece" });
    routes.push({ type: "speaker", label: "Speaker" });

    // Check for headset (platform-specific)
    if (this.isHeadsetConnected) {
      routes.push({ type: "headset", label: "Wired Headset" });
    }

    // Check for Bluetooth
    if (this.isBluetoothConnected) {
      routes.push({ type: "bluetooth", label: "Bluetooth" });
    }

    this.availableRoutes = routes;
    this.emit("audio-routes-updated", {
      routes: this.availableRoutes,
    });
  }

  async setAudioRoute(route: AudioRouteTypes) {
    callLog.debug("call › setting audio route to:", route);

    switch (route) {
      case "speaker":
        InCallManager.setForceSpeakerphoneOn(true);
        this.currentAudioRoute = "speaker";
        break;

      case "earpiece":
        InCallManager.setForceSpeakerphoneOn(false);
        this.currentAudioRoute = "earpiece";
        break;

      case "headset":
        // For wired headsets, just turn off speaker - system auto-routes
        InCallManager.setForceSpeakerphoneOn(false);
        this.currentAudioRoute = "headset";
        break;

      case "bluetooth":
        // For Bluetooth, ensure SCO is enabled for call audio
        InCallManager.setForceSpeakerphoneOn(false);
        // Note: On some Android versions, additional native code may be needed
        this.currentAudioRoute = "bluetooth";
        break;

      default:
        callLog.warn("call › unknown audio route:", route);
    }

    this.emit("audio-route-changed", {
      route: this.currentAudioRoute,
      available: this.availableRoutes,
    });
  }

  /**
   * Listens for remote media streams from the connection service and emits them to listeners.
   */
  listenToRemoteStream() {
    this.connectionService.on("remoteStream", (stream) => {
      callLog.debug("call › remote stream received");
      this.emit("remoteStream", stream);
    });
    this.connectionService.on("switch-cam", (stream) => {
      this.emit("switch-cam", stream);
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
      InCallManager.stop();
      InCallManager.setKeepScreenOn(false);
      this.connectionService.sendCallMessage(peerId, {
        type: "call-ended",
        data: { from: this.userStore.user.id, to: peerId },
      });
      this.connectedState = "disconnected";
      this.initialRouteSetFor.delete(peerId);
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

  toggleSpeaker() {
    const newRoute =
      this.currentAudioRoute === "speaker" ? "earpiece" : "speaker";
    this.setAudioRoute(newRoute);
  }

  async switchCamera(peerId: string, isFrontCamera: boolean) {
    await this.connectionService.switchCamera(peerId, isFrontCamera);
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
