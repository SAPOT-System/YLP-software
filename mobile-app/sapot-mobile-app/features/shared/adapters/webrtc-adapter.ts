import { EventEmitter } from "events";
import {
    mediaDevices,
    MediaStream,
    MediaStreamTrack,
    RTCIceCandidate,
    RTCPeerConnection,
    RTCSessionDescription,
} from "react-native-webrtc";
import { RTCSessionDescriptionInit } from "react-native-webrtc/lib/typescript/RTCSessionDescription";
import { WebrtcDataMessage } from "../types";
import baseLogger from "../utils/logger";

const webrtcLog = baseLogger.extend("webrtc");

interface RTCIceCandidateInit {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

/**
 * WebrtcAdapter manages WebRTC peer connections, media streams, and data channels for real-time communication.
 * It handles signaling, ICE candidates, media control, and emits events for connection and media state changes.
 */
export class WebrtcAdapter extends EventEmitter {
  /**
   * This property holds the connection of webrtc
   */
  private peerConnection?: RTCPeerConnection;

  /**
   * This property stores the audio and video of the current user of the app
   */
  private localStream?: MediaStream;

  // Note: remoteStream and dataChannel have a type of any because there is a conflict on its type

  /**
   * This property stores the audio and video of the peer that is currently interacting by the user
   */
  private remoteStream?: MediaStream;

  /**
   * This property manages the chat connection
   */
  private dataChannel?: RTCDataChannel;

  /**
   * This property holds the information whether the app will use servers or not
   */
  private configuration: RTCConfiguration;

  /**
   * This property holds the array of data that is essential to the connection
   */
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  /**
   * Tracks ICE restart retry attempts and timers.
   */
  private iceRestartTimer?: ReturnType<typeof setTimeout>;
  private iceRestartAttempts = 0;
  private isIceRestarting = false;
  private isMakingOffer = false;
  private readonly maxIceRestartAttempts = 3;
  private readonly iceRestartDelayMs = 1500;

  /**
   * This flag will be used to by the app to know if remote description is set which is useful on forming connection
   */
  private remoteDescriptionSet: boolean = false;

  /**
   * This property is capable of controlling microphone
   */
  private audioTrack?: MediaStreamTrack;

  /**
   * This property is capable of controlling camera visibility
   */
  private videoTrack?: MediaStreamTrack;

  /**
   * This property holds the id of peer that holds this class state
   */
  readonly peerId: string;

  /**
   * Constructs a WebrtcAdapter instance for a given peer.
   * @param peerId The peer id this adapter is associated with
   */
  constructor(peerId: string) {
    super();
    this.peerId = peerId;
    this.configuration = {
      iceServers: [
        // No turn server for physical devices
        // Just for development for android emulators. Note that the host computer needs to run turn server to make this work.
        // {
        //   urls: [
        //     "turn:10.0.2.2:5349?transport=udp",
        //     "turn:10.0.2.2:5349?transport=tcp",
        //   ],
        //   username: "test",
        //   credential: "test",
        // },
      ],
      iceTransportPolicy: "all",
    };
  }

  /**
   * Initializes the local media stream with audio and/or video.
   * Adds tracks to the peer connection if available.
   * @param audio Whether to enable audio
   * @param video Whether to enable video
   * @returns Promise<void>
   */
  async initializeLocalStream(audio = false, video = false) {
    try {
      const constraints = {
        audio,
        video: video
          ? {
              width: { min: 640, ideal: 1280 },
              height: { min: 480, ideal: 720 },
              frameRate: { min: 30, ideal: 60 },
            }
          : false,
      };

      this.localStream = await mediaDevices.getUserMedia(constraints);

      this.audioTrack = this.localStream.getAudioTracks()[0];
      this.videoTrack = this.localStream.getVideoTracks()[0];

      // Add local stream to connection for audio calls and video calls
      if (this.localStream) {
        webrtcLog.debug("webrtc › local stream add");
        for (const track of this.localStream.getTracks()) {
          webrtcLog.debug("webrtc › track add", { kind: track.kind });
          if (!this.peerConnection)
            throw new Error("Peer connection not initialized");
          const existingSender = this.peerConnection
            .getSenders()
            .find((sender) => sender.track?.kind === track.kind);

          if (existingSender) {
            await existingSender.replaceTrack(track);
          } else {
            this.peerConnection.addTrack(track, this.localStream!);
          }
        }
      } else {
        webrtcLog.warn("webrtc › local stream missing");
      }
    } catch (error) {
      webrtcLog.error("webrtc › local stream init failed", {
        audio,
        video,
        error,
      });
      throw error;
    }
  }

  /**
   * Creates and configures a new RTCPeerConnection, sets up event handlers, and creates a data channel.
   */
  createPeerConnection() {
    try {
      webrtcLog.debug("webrtc › peer connection create");
      this.peerConnection = new RTCPeerConnection(this.configuration);

      // This will receive media such as audio and video of peers
      this.peerConnection.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) {
          this.remoteStream = stream;
        } else if (this.remoteStream) {
          this.remoteStream.addTrack(event.track);
        } else {
          this.remoteStream = new MediaStream();
          this.remoteStream.addTrack(event.track);
        }
        if (this.remoteStream) {
          this.emit("remoteStream", this.remoteStream);
        }
      };

      this.peerConnection.onconnectionstatechange = (_event) => {
        webrtcLog.debug("webrtc › connection state", {
          state: this.peerConnection?.connectionState,
        });
        switch (this.peerConnection?.connectionState) {
          case "closed":
            webrtcLog.info("webrtc › connection closed");
            this.emit("connection-closed");
            break;
          case "connected":
            if (this.dataChannel?.readyState == "open") {
              this.emit("connection-established");
            }
            break;
        }
      };

      this.peerConnection.ondatachannel = (event) => {
        webrtcLog.debug("webrtc › data channel received");
        this.setDataChannel(event.channel);
      };

      this.peerConnection.oniceconnectionstatechange = (_event) => {
        webrtcLog.debug("webrtc › ice state", {
          state: this.peerConnection?.iceConnectionState,
        });
        switch (this.peerConnection?.iceConnectionState) {
          case "connected":
          case "completed":
            this.resetIceRestartState();
            if (this.peerConnection?.iceConnectionState === "connected") {
              webrtcLog.info("webrtc › ice connected");
            }
            if (this.peerConnection?.iceConnectionState === "completed") {
              webrtcLog.info("webrtc › ice completed");
            }
            break;
          case "disconnected":
            this.scheduleIceRestart("disconnected");
            break;
          case "failed":
            this.scheduleIceRestart("failed", true);
            break;
        }
      };

      this.peerConnection.onnegotiationneeded = async () => {
        try {
          if (!this.peerConnection) return;
          if (
            this.isMakingOffer ||
            this.peerConnection.signalingState !== "stable" ||
            this.isIceRestarting
          ) {
            return;
          }
          this.isMakingOffer = true;
          const { type, sdp } = await this.createOffer();
          this.emit("signal-offer", { type, sdp, reason: "negotiationneeded" });
        } catch (error) {
          webrtcLog.warn("webrtc › negotiation needed failed", { error });
        } finally {
          this.isMakingOffer = false;
        }
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          webrtcLog.debug("webrtc › ice candidate send");
          this.emit("onicecandidate", event.candidate);
        }
      };

      // Create data channel for text chat
      const channel = this.peerConnection.createDataChannel(
        "chat"
      ) as unknown as RTCDataChannel;
      this.dataChannel = channel;
      // webrtcLog.debug("webrtc › data channel state", { hasChannel: Boolean(this.dataChannel) });
      this.setupDataChannel(channel);

      // webrtcLog.debug("webrtc › peer connection created", { hasConnection: Boolean(this.peerConnection) });
    } catch (error) {
      webrtcLog.error("webrtc › peer connection create failed", { error });
      throw error;
    }
  }

  /**
   * Sets the data channel and attaches event handlers for messaging and state changes.
   * @param channel The RTCDataChannel to set
   */
  setDataChannel(channel: RTCDataChannel) {
    try {
      this.dataChannel = channel;
      this.setupDataChannel(channel);
    } catch (error) {
      webrtcLog.error("webrtc › data channel set failed", { error });
      throw error;
    }
  }

  /**
   * Creates a WebRTC offer and sets the local description.
   * Waits for signaling state to be stable if needed.
   * @returns Promise<{ type: "offer"; sdp: any }>
   */
  async createOffer() {
    return new Promise<{ type: "offer"; sdp: string }>(
      (resolve, reject) => {
        try {
          if (!this.peerConnection) {
            webrtcLog.debug("webrtc › offer init peer connection");
            this.createPeerConnection();
          }
          if (this.isMakingOffer) {
            reject(new Error("Offer already in progress"));
            return;
          }
          this.isMakingOffer = true;
          webrtcLog.debug("webrtc › offer create");
          if (this.peerConnection?.signalingState === "have-remote-offer") {
            this.isMakingOffer = false;
            reject(new Error("Signaling state has remote offer"));
            return;
          }
          if (this.peerConnection?.signalingState === "stable") {
            this.peerConnection!.createOffer()
              .then(async (offer) => {
                webrtcLog.debug("webrtc › offer set local description");
                await this.peerConnection!.setLocalDescription(offer);

                resolve({
                  type: "offer",
                  sdp: offer.sdp,
                });
                this.isMakingOffer = false;
              })
              .catch((error) => {
                this.isMakingOffer = false;
                reject(error);
              });
          } else {
            webrtcLog.debug("webrtc › offer wait stable");
            const onStable = async () => {
              if (this.peerConnection?.signalingState === "stable") {
                this.peerConnection.onsignalingstatechange = () => null;
                const offer = await this.peerConnection!.createOffer();
                webrtcLog.debug("webrtc › offer set local description");
                await this.peerConnection!.setLocalDescription(offer);

                resolve({
                  type: "offer",
                  sdp: offer.sdp,
                });
                this.isMakingOffer = false;
              }
            };
            this.peerConnection!.onsignalingstatechange = async () =>
              await onStable();
          }
        } catch (error) {
          webrtcLog.error("webrtc › offer create failed", { error });

          this.isMakingOffer = false;

          reject(error);
        }
      }
    );
  }

  /**
   * Creates a WebRTC offer for ICE restart and emits signaling payload.
   */
  async restartIce() {
    try {
      if (!this.peerConnection) {
        webrtcLog.warn("webrtc › ice restart skipped", {
          reason: "no peer connection",
        });
        return;
      }
      if (this.peerConnection.signalingState !== "stable") {
        webrtcLog.warn("webrtc › ice restart skipped", {
          reason: "signaling state",
          state: this.peerConnection.signalingState,
        });
        return;
      }
      if (this.isIceRestarting) return;
      this.isIceRestarting = true;

      webrtcLog.info("webrtc › ice restart");
      const offer = await this.peerConnection.createOffer({ iceRestart: true });
      await this.peerConnection.setLocalDescription(offer);
      this.emit("signal-offer", {
        type: "offer",
        sdp: offer.sdp,
        iceRestart: true,
      });
    } catch (error) {
      webrtcLog.warn("webrtc › ice restart failed", { error });
    } finally {
      this.isIceRestarting = false;
    }
  }

  private resetIceRestartState() {
    this.iceRestartAttempts = 0;
    if (this.iceRestartTimer) {
      clearTimeout(this.iceRestartTimer);
      this.iceRestartTimer = undefined;
    }
  }

  private scheduleIceRestart(reason: "disconnected" | "failed", immediate = false) {
    if (this.isIceRestarting) return;
    if (this.iceRestartAttempts >= this.maxIceRestartAttempts) {
      webrtcLog.warn("webrtc › ice restart attempts exceeded", { reason });
      return;
    }

    if (this.iceRestartTimer) {
      clearTimeout(this.iceRestartTimer);
      this.iceRestartTimer = undefined;
    }

    const delayMs = immediate ? 0 : this.iceRestartDelayMs;
    this.iceRestartTimer = setTimeout(() => {
      this.iceRestartAttempts += 1;
      this.restartIce();
    }, delayMs);
  }

  /**
   * Handles an incoming WebRTC offer, sets the remote description, creates and returns an answer.
   * @param offer The RTCSessionDescriptionInit offer
   * @returns Promise<{ type: "answer"; sdp: string }>
   */
  async handleOffer(
    offer: RTCSessionDescriptionInit | undefined
  ): Promise<{ type: "answer"; sdp: string }> {
    try {
      if (!this.peerConnection) {
        webrtcLog.debug("webrtc › offer init peer connection");
        this.createPeerConnection();
      }

      webrtcLog.debug("webrtc › offer set remote description");

      await this.peerConnection!.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await this.peerConnection!.createAnswer();
      webrtcLog.debug("webrtc › offer set local description");
      await this.peerConnection!.setLocalDescription(answer);

      this.remoteDescriptionSet = true;

      for (const candidate of this.pendingIceCandidates) {
        await this.addIceCandidate(candidate);
      }

      this.pendingIceCandidates = [];

      return {
        type: "answer",
        sdp: answer.sdp,
      };
    } catch (error) {
      webrtcLog.error("webrtc › offer handle failed", { error });
      throw error;
    }
  }

  /**
   * Handles an incoming WebRTC answer, sets the remote description, and processes pending ICE candidates.
   * @param answer The RTCSessionDescriptionInit answer
   * @returns Promise<void>
   */
  async handleAnswer(answer: RTCSessionDescriptionInit | undefined) {
    try {
      if (!this.peerConnection) {
        webrtcLog.warn("webrtc › answer skipped", { reason: "no peer connection" });
        return;
      }

      if (this.peerConnection.signalingState !== "have-local-offer") {
        webrtcLog.warn("webrtc › answer ignored", {
          state: this.peerConnection.signalingState,
        });
        return;
      }

      webrtcLog.debug("webrtc › answer set remote description");

      await this.peerConnection!.setRemoteDescription(
        new RTCSessionDescription(answer)
      );

      this.remoteDescriptionSet = true;

      for (const candidate of this.pendingIceCandidates) {
        await this.addIceCandidate(candidate);
      }
      this.pendingIceCandidates = [];
    } catch (error) {
      webrtcLog.error("webrtc › answer handle failed", { error });
    }
  }

  /**
   * Adds an ICE candidate to the peer connection, or queues it if remote description is not set.
   * @param candidate The ICE candidate to add
   * @returns Promise<void>
   */
  async addIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (!this.peerConnection) {
        webrtcLog.warn("webrtc › ice add skipped", { reason: "no peer connection" });
        return;
      }

      if (!this.remoteDescriptionSet) {
        webrtcLog.debug("webrtc › ice queued");
        this.pendingIceCandidates.push(candidate);
        return;
      }

      webrtcLog.debug("webrtc › ice add");

      await this.peerConnection!.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (error) {
      webrtcLog.error("webrtc › ice add failed", { error });
      throw error;
    }
  }

  /**
   * Sets up event handlers for the data channel (open, message, error, close).
   * @param channel The RTCDataChannel to set up
   */
  setupDataChannel(channel: RTCDataChannel) {
    try {
      // webrtcLog.debug("webrtc › data channel setup");
      channel.onopen = () => {
        webrtcLog.info("webrtc › data channel open");
        this.emit("datachannel-open");

        if (this.peerConnection?.connectionState === "connected")
          this.emit("connection-established");
      };

      // This will recieve message from peers webrtc's datachannel
      channel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          // webrtcLog.debug("webrtc › data channel message", { hasMessage: true });
          this.emit("receivedMessage", message);
        } catch (error) {
          webrtcLog.error("webrtc › data channel parse failed", { error });
        }
      };

      channel.onerror = (error) => {
        this.emit("connection-failed", error);
      };

      channel.onclose = () => {
        webrtcLog.info("webrtc › data channel closed");
      };
    } catch (error) {
      webrtcLog.error("webrtc › data channel setup failed", { error });
      throw error;
    }
  }

  // TODO: make a type interface for the payload paramater
  /**
   * Sends a data message over the WebRTC data channel.
   * @param payload The message payload to send
   * @throws Error if data channel is not open or not connected
   */
  sendDataMessage(payload: WebrtcDataMessage) {
    try {
      if (
        this.dataChannel &&
        this.dataChannel.readyState === "open" &&
        this.isConnected
      ) {
        // webrtcLog.debug("webrtc › data send", { messageType: payload.type });
        this.dataChannel.send(JSON.stringify(payload));
      } else {
        throw new Error("Unable to send payload`");
      }
    } catch (error) {
      webrtcLog.warn("webrtc › data send failed", {
        messageType: payload.type,
        error,
      });
      throw error;
    }
  }

  /**
   * Terminates the call by stopping local media tracks and removing them from the peer connection.
   * @throws Error if termination fails
   */
  terminateCall() {
    try {
      if (!this.localStream) {
        webrtcLog.warn("webrtc › terminate skipped", {
          reason: "no local stream",
        });
        return;
      }
      if (!this.peerConnection) {
        webrtcLog.warn("webrtc › terminate skipped", {
          reason: "no peer connection",
        });
        return;
      }
      // stop local media tracks
      this.localStream.getTracks().forEach((track) => track.stop());

      // remove tracks from connection
      this.peerConnection.getSenders().forEach((sender) => {
        if (
          sender.track &&
          (sender.track.kind === "audio" || sender.track.kind === "video")
        ) {
          this.peerConnection!.removeTrack(sender);
        }
      });
    } catch (error) {
      webrtcLog.error("webrtc › terminate failed", { error });
      throw error;
    }
  }

  /**
   * Toggles the microphone (audio track) enabled state.
   * @throws Error if audio track is not initialized
   */
  toggleMic() {
    try {
      if (!this.audioTrack) throw Error("Audio track not initialized");
      this.audioTrack.enabled = this.audioTrack.enabled ? false : true;
      webrtcLog.debug("webrtc › mic toggled", {
        enabled: this.audioTrack.enabled,
      });
    } catch (error) {
      webrtcLog.error("webrtc › mic toggle failed", { error });
      throw error;
    }
  }

  /**
   * Toggles the camera (video track) enabled state.
   * @throws Error if video track is not initialized
   */
  toggleCamera() {
    try {
      if (!this.videoTrack) throw Error("Video track not initialized");
      this.videoTrack.enabled = this.videoTrack.enabled ? false : true;
      webrtcLog.debug("webrtc › camera toggled", {
        enabled: this.videoTrack.enabled,
      });
    } catch (error) {
      webrtcLog.error("webrtc › camera toggle failed", { error });
      throw error;
    }
  }

  /**
   * Returns whether the WebRTC connection and data channel are both open/connected.
   * @returns boolean True if connected, false otherwise
   */
  get isConnected() {
    try {
      return (
        this.peerConnection?.connectionState === "connected" &&
        this.dataChannel?.readyState === "open"
      );
    } catch (error) {
      webrtcLog.error("webrtc › connection state read failed", { error });
      throw error;
    }
  }

  /**
   * Gets the local media stream.
   * @returns MediaStream The local stream
   * @throws Error if local stream is undefined
   */
  getLocalStream() {
    try {
      if (!this.localStream) throw new Error("Local stream is undefined");
      return this.localStream;
    } catch (error) {
      webrtcLog.error("webrtc › local stream get failed", { error });
      throw error;
    }
  }

  /**
   * Cleans up all WebRTC resources, closes streams and connections, and resets state.
   * @throws Error if cleanup fails
   */
  cleanup() {
    try {
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => track.stop());
        this.localStream = undefined;
      }

      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = undefined;
      }

      this.remoteStream = undefined;
      this.dataChannel = undefined;
      this.pendingIceCandidates = [];
      this.remoteDescriptionSet = false;
      this.resetIceRestartState();
      webrtcLog.info("webrtc › cleanup");
    } catch (error) {
      webrtcLog.error("webrtc › cleanup failed", { error });
      throw error;
    }
  }
}
