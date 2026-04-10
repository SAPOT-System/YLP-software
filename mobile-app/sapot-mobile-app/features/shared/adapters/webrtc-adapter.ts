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
        console.log("[WebrtcAdapter]: Adding local stream to connection");
        for (const track of this.localStream.getTracks()) {
          console.log("[WebrtcAdapter]: Adding track: ", track.kind);
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
        console.log("[WebrtcAdapter]: No local stream to connection");
      }
    } catch (error) {
      console.error(
        `[WebrtcAdapter]: Error initializing local stream\n${JSON.stringify(
          { audio, video },
          null,
          2
        )}`
      );
      throw error;
    }
  }

  /**
   * Creates and configures a new RTCPeerConnection, sets up event handlers, and creates a data channel.
   */
  createPeerConnection() {
    try {
      console.log("[WebrtcAdapter]: Creating peer connection...");
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
        console.log("[WebrtcAdapter]:",this.peerConnection?.connectionState);
        switch (this.peerConnection?.connectionState) {
          case "closed":
            console.log("[WebrtcAdapter]: Call being disconnected");
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
        console.log(`Data channel received: ${event.channel}`);
        this.setDataChannel(event.channel);
      };

      this.peerConnection.oniceconnectionstatechange = (_event) => {
        console.log(
          "[WebrtcAdapter]: ICE Connection state:",
          this.peerConnection?.iceConnectionState
        );
        switch (this.peerConnection?.iceConnectionState) {
          case "connected":
          case "completed":
            this.resetIceRestartState();
            if (this.peerConnection?.iceConnectionState === "connected") {
              console.log("[WebrtcAdapter]: ICE connection connected");
            }
            if (this.peerConnection?.iceConnectionState === "completed") {
              console.log("[WebrtcAdapter]: ICE connection completed");
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
          console.warn("[WebrtcAdapter]: Negotiation needed failed", error);
        } finally {
          this.isMakingOffer = false;
        }
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`[WebrtcAdapter]: Sending ice cnadidate`);
          this.emit("onicecandidate", event.candidate);
        }
      };

      // Create data channel for text chat
      const channel = this.peerConnection.createDataChannel(
        "chat"
      ) as unknown as RTCDataChannel;
      this.dataChannel = channel;
      // console.log(this.dataChannel ? "Data channel on" : "Data channel off");
      this.setupDataChannel(channel);

      // console.log("Peer connection created:", this.peerConnection ? true : false);
    } catch (error) {
      console.error("[WebrtcAdapter]: Error creating peer connection:", error);
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
      console.error("[WebrtcAdapter]: Error to set data channel:", error);
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
            console.log(
              "[WebrtcAdapter]: Creating peer connection in create offer method"
            );
            this.createPeerConnection();
          }
          if (this.isMakingOffer) {
            reject(new Error("Offer already in progress"));
            return;
          }
          this.isMakingOffer = true;
          console.log(`[WebrtcAdapter]: Creating offer...`);
          if (this.peerConnection?.signalingState === "have-remote-offer") {
            this.isMakingOffer = false;
            reject(new Error("Signaling state has remote offer"));
            return;
          }
          if (this.peerConnection?.signalingState === "stable") {
            console.log("stable");
            this.peerConnection!.createOffer()
              .then(async (offer) => {
                console.log(`[WebrtcAdapter-createOffer]: Setting local description...`);
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
            console.log("Not stable");
            const onStable = async () => {
              if (this.peerConnection?.signalingState === "stable") {
                console.log("run");
                this.peerConnection.onsignalingstatechange = () => null;
                const offer = await this.peerConnection!.createOffer();
                console.log(`[WebrtcAdapter-createOffer]: Setting local description...`);
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
          console.error("[WebrtcAdapter]: Error creating offer:", error);

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
        console.log("[WebrtcAdapter]: No peer connection for ICE restart");
        return;
      }
      if (this.peerConnection.signalingState !== "stable") {
        console.warn(
          "[WebrtcAdapter]: Skipping ICE restart due to signaling state",
          this.peerConnection.signalingState
        );
        return;
      }
      if (this.isIceRestarting) return;
      this.isIceRestarting = true;

      console.log("[WebrtcAdapter]: Performing ICE restart");
      const offer = await this.peerConnection.createOffer({ iceRestart: true });
      await this.peerConnection.setLocalDescription(offer);
      this.emit("signal-offer", {
        type: "offer",
        sdp: offer.sdp,
        iceRestart: true,
      });
    } catch (error) {
      console.warn("[WebrtcAdapter]: ICE restart failed", error);
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
      console.warn("[WebrtcAdapter]: ICE restart attempts exceeded", { reason });
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
        console.log(
          "[WebrtcAdapter]: Creating peer connection in handle offer method"
        );
        this.createPeerConnection();
      }

      console.log(`[WebrtcAdapter]: Setting remote description`);

      await this.peerConnection!.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await this.peerConnection!.createAnswer();
      console.log(`[WebrtcAdapter-handleOffer]: Setting local description`);
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
      console.error("[WebrtcAdapter]: Error handling offer:", error);
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
        console.log("[WebrtcAdapter]: No peer connection");
        return;
      }

      if (this.peerConnection.signalingState !== "have-local-offer") {
        console.warn(
          "[WebrtcAdapter]: Ignoring answer due to signaling state",
          this.peerConnection.signalingState
        );
        return;
      }

      console.log(`[WebrtcAdapter-handleAnswer]: Setting remote description`);

      await this.peerConnection!.setRemoteDescription(
        new RTCSessionDescription(answer)
      );

      this.remoteDescriptionSet = true;

      for (const candidate of this.pendingIceCandidates) {
        await this.addIceCandidate(candidate);
      }
      this.pendingIceCandidates = [];
    } catch (error) {
      console.error("[WebrtcAdapter]: Error handling answer:", error);
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
        console.log("[WebrtcAdapter]: No peer connection");
        return;
      }

      if (!this.remoteDescriptionSet) {
        console.log("[WebrtcAdapter]: Queueing ICE candidate");
        this.pendingIceCandidates.push(candidate);
        return;
      }

      console.log(`[WebrtcAdapter]: Adding ice candidate`);

      await this.peerConnection!.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (error) {
      console.error("[WebrtcAdapter]: Error adding ice candidate:", error);
      throw error;
    }
  }

  /**
   * Sets up event handlers for the data channel (open, message, error, close).
   * @param channel The RTCDataChannel to set up
   */
  setupDataChannel(channel: RTCDataChannel) {
    try {
      // console.log(`[WebrtcAdapter]: Setup data channel`);
      channel.onopen = () => {
        console.log("[WebrtcAdapter]: Data channel opened");
        this.emit("datachannel-open");

        if (this.peerConnection?.connectionState === "connected")
          this.emit("connection-established");
      };

      // This will recieve message from peers webrtc's datachannel
      channel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          // console.log(`[WebrtcAdapter]: Data channel received: ${message}`);
          this.emit("receivedMessage", message);
        } catch (error) {
          console.error("Error parsing receive message:", error);
        }
      };

      channel.onerror = (error) => {
        this.emit("connection-failed", error);
      };

      channel.onclose = () => {
        console.log("[WebrtcAdapter]: Data channel closed");
      };
    } catch (error) {
      console.error("[WebrtcAdapter]: Error to setup data channel:", error);
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
        // console.log(`[WebrtcAdapter]: Sending payload: ${payload}`);
        this.dataChannel.send(JSON.stringify(payload));
      } else {
        throw new Error("Unable to send payload`");
      }
    } catch (error) {
      console.warn(
        `[WebrtcAdapter]: Error sending data message\n${JSON.stringify(
          payload,
          null,
          2
        )}`
      );
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
        console.log("local stream null");
        return;
      }
      if (!this.peerConnection) {
        console.log("peer connection null");
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
      console.error("[WebrtcAdapter]: Error terminating the call:", error);
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
      console.log("toggling mic to", this.audioTrack.enabled);
    } catch (error) {
      console.error("[WebrtcAdapter]: Error toggling the microphone:", error);
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
      console.log("toggling camera to", this.videoTrack.enabled);
    } catch (error) {
      console.error("[WebrtcAdapter]: Error toggling the camera:", error);
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
      console.error(
        "[WebrtcAdapter]: Error getting if webrtc is connected:",
        error
      );
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
      console.error("[WebrtcAdapter]: Error getting local stream:", error);
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
      console.log("[WebrtcAdapter]: Cleanup");
    } catch (error) {
      console.error("[WebrtcAdapter]: Error getting local stream:", error);
      throw error;
    }
  }
}
