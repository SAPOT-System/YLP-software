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
import { webrtcLog } from "../utils/logger";

webrtcLog.debug("[webrtc-adapter] module loaded");

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
  private peerConnection?: RTCPeerConnection;
  private localStream?: MediaStream;
  private remoteStream?: MediaStream;
  private dataChannel?: RTCDataChannel;
  // eslint-disable-next-line no-undef
  private configuration: RTCConfiguration;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  private iceRestartTimer?: ReturnType<typeof setTimeout>;
  private iceRestartAttempts = 0;
  private isIceRestarting = false;
  private isMakingOffer = false;
  private negotiationQueue: Promise<void> = Promise.resolve();
  private readonly maxIceRestartAttempts = 3;
  private readonly iceRestartDelayMs = 1500;

  private remoteDescriptionSet: boolean = false;
  private audioTrack?: MediaStreamTrack;
  private videoTrack?: MediaStreamTrack;

  readonly peerId: string;
  private isPolite: boolean = false;
  private isIgnoringOffer = false;
  private isSettingRemoteAnswerPending = false;

  private traceId;

  constructor(peerId: string) {
    super();
    this.peerId = peerId;
    this.traceId = `${this.peerId}-${Date.now()}`;
    webrtcLog.info("webrtc › adapter constructed", { peerId });
    this.configuration = {
      iceServers: [],
      iceTransportPolicy: "all",
    };
  }

  setIsPolite(isPolite: boolean) {
    webrtcLog.debug("polite set to", isPolite);
    this.isPolite = isPolite;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private trace(event: string, data: Record<string, any> = {}) {
    webrtcLog.debug(`webrtc [${this.traceId}] ${event}`, {
      peerId: this.peerId,
      signalingState: this.peerConnection?.signalingState,
      iceConnectionState: this.peerConnection?.iceConnectionState,
      connectionState: this.peerConnection?.connectionState,
      ...data,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private logFailure(reason: string, error?: any) {
    this.trace("CALL FAILED", {
      reason,
      error,
      signalingState: this.peerConnection?.signalingState,
      iceState: this.peerConnection?.iceConnectionState,
      connectionState: this.peerConnection?.connectionState,
      pendingCandidates: this.pendingIceCandidates.length,
      isMakingOffer: this.isMakingOffer,
      isIgnoringOffer: this.isIgnoringOffer,
    });
  }

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
      webrtcLog.debug("initializeLocalStream", this.videoTrack);

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
      this.logFailure("initializeLocalStream failed", error);
      throw error;
    }
  }

  createPeerConnection() {
    try {
      webrtcLog.debug("webrtc › peer connection create");
      this.peerConnection = new RTCPeerConnection(this.configuration);

      this.peerConnection.ontrack = (event) => {
        webrtcLog.debug("webrtc › ontrack event:", {
          hasStreams: !!event.streams,
          streamsLength: event.streams?.length,
          trackKind: event.track?.kind,
          trackId: event.track?.id,
        });

        let stream = event.streams?.[0];

        if (!stream && this.remoteStream) {
          stream = this.remoteStream;
          stream.addTrack(event.track);
        } else if (!stream && !this.remoteStream) {
          stream = new MediaStream();
          stream.addTrack(event.track);
        }

        if (stream) {
          this.remoteStream = stream;
          setTimeout(() => {
            if (this.remoteStream && this.remoteStream.getTracks().length > 0) {
              this.emit("remoteStream", this.remoteStream);
            } else {
              webrtcLog.warn("webrtc › Stream has no tracks after delay");
            }
          }, 100);
        } else {
          webrtcLog.error("webrtc › Failed to get or create remote stream");
        }
      };

      this.peerConnection.onconnectionstatechange = (_event) => {
        this.trace("connection-state-change");

        switch (this.peerConnection?.connectionState) {
          case "closed":
            this.trace("connection-closed");
            this.emit("connection-closed");
            break;
          case "connected":
            if (this.dataChannel?.readyState == "open") {
              this.trace("connection-success");
              this.emit("connection-established");
            }
            break;
          case "failed":
            this.trace("connection-failed"); // fixed typo
            break;
        }
      };

      this.peerConnection.ondatachannel = (event) => {
        webrtcLog.debug("webrtc › data channel received");
        this.setDataChannel(event.channel);
      };

      this.peerConnection.oniceconnectionstatechange = (_event) => {
        this.trace("ice-state-change");

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
            this.trace("ice-failed", {
              pendingCandidates: this.pendingIceCandidates.length,
            });
            break;
        }
      };

      this.peerConnection.onnegotiationneeded = () => {
        this.enqueueNegotiation(async () => {
          if (!this.peerConnection) return;
          if (this.isMakingOffer) return;
          if (this.peerConnection.signalingState !== "stable") {
            webrtcLog.debug("webrtc › skip negotiation (not stable)");
            return;
          }

          try {
            this.isMakingOffer = true;
            this.trace("create-offer:start");
            const offer = await this.peerConnection!.createOffer();
            this.trace("create-offer:success", {
              sdpLength: offer.sdp?.length,
            });
            this.trace("set-local-description:start", {
              type: offer.type,
            });

            await this.peerConnection!.setLocalDescription(offer);

            this.trace("set-local-description:done");

            this.emit("signal-offer", {
              type: "offer",
              sdp: offer.sdp,
              reason: "negotiationneeded",
            });
          } catch (error) {
            webrtcLog.warn("webrtc › negotiationneeded failed", { error });
          } finally {
            this.isMakingOffer = false;
          }
        });
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.trace("ice-candidate:generated", {
            candidate: event.candidate.candidate,
          });
          this.emit("onicecandidate", event.candidate);
        } else {
          this.trace("ice-candidate:gathering-complete");
        }
      };

      const channel = this.peerConnection.createDataChannel(
        "chat"
      ) as unknown as RTCDataChannel;
      this.dataChannel = channel;
      this.setupDataChannel(channel);
    } catch (error) {
      this.logFailure("createPeerConnection failed", error);
      throw error;
    }
  }

  setDataChannel(channel: RTCDataChannel) {
    try {
      this.dataChannel = channel;
      this.setupDataChannel(channel);
    } catch (error) {
      webrtcLog.error("webrtc › data channel set failed", { error });
      throw error;
    }
  }

  async createOffer(): Promise<{ type: "offer"; sdp: string }> {
    if (!this.peerConnection) {
      this.createPeerConnection();
    }

    try {
      this.isMakingOffer = true;

      this.trace("create-offer:start");
      const offer = await this.peerConnection!.createOffer();
      this.trace("create-offer:success", {
        sdpLength: offer.sdp?.length,
      });
      this.trace("set-local-description:start", {
        type: offer.type,
      });

      await this.peerConnection!.setLocalDescription(offer);

      this.trace("set-local-description:done");

      return {
        type: "offer",
        sdp: offer.sdp!,
      };
    } catch (error) {
      this.logFailure("createOffer failed", error);
      throw error;
    } finally {
      this.isMakingOffer = false;
    }
  }

  async restartIce() {
    if (!this.peerConnection) return;

    return this.enqueueNegotiation(async () => {
      try {
        if (this.peerConnection!.signalingState !== "stable") {
          webrtcLog.warn("webrtc › skip ice restart (not stable)");
          return;
        }

        webrtcLog.info("webrtc › ice restart");
        this.trace("create-offer:start");

        const offer = await this.peerConnection!.createOffer({
          iceRestart: true,
        });
        this.trace("create-offer:success", {
          sdpLength: offer.sdp?.length,
        });

        this.trace("set-local-description:start", {
          type: offer.type,
        });

        await this.peerConnection!.setLocalDescription(offer);

        this.trace("set-local-description:done");

        this.emit("signal-offer", {
          type: "offer",
          sdp: offer.sdp,
          iceRestart: true,
        });
      } catch (error) {
        webrtcLog.warn("webrtc › ice restart failed", { error });
        this.logFailure("restartIce failed", error);
      }
    });
  }

  private resetIceRestartState() {
    this.iceRestartAttempts = 0;
    if (this.iceRestartTimer) {
      clearTimeout(this.iceRestartTimer);
      this.iceRestartTimer = undefined;
    }
  }

  private scheduleIceRestart(
    reason: "disconnected" | "failed",
    immediate = false
  ) {
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

  async handleOffer(
    offer: RTCSessionDescriptionInit
  ): Promise<{ type: "answer"; sdp: string } | undefined> {
    if (!this.peerConnection) {
      this.createPeerConnection();
    }

    const pc = this.peerConnection!;

    this.trace("handle-offer:received", {
      sdpLength: offer.sdp?.length,
    });
    const offerCollision = this.isMakingOffer || pc.signalingState !== "stable";

    if (offerCollision) {
      this.trace("glare-detected", {
        isMakingOffer: this.isMakingOffer,
        signalingState: pc.signalingState,
      });
    }

    this.isIgnoringOffer = !this.isPolite && offerCollision;

    if (this.isIgnoringOffer) {
      this.trace("offer-ignored", {
        reason: "impolite-peer-collision",
      });
      webrtcLog.warn("webrtc › ignoring offer (glare)", this.isPolite);
      return;
    }

    return this.enqueueNegotiation(async () => {
      try {
        // Allow processing if we are the polite peer and we have a pending local offer
        if (
          pc.signalingState !== "stable" &&
          !(this.isPolite && pc.signalingState === "have-local-offer")
        ) {
          webrtcLog.warn("webrtc › not stable, skipping offer", {
            signalingState: pc.signalingState,
            isPolite: this.isPolite,
          });
          return;
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        this.trace("create-answer:start");

        const answer = await pc.createAnswer();

        this.trace("create-answer:success", {
          sdpLength: answer.sdp?.length,
        });
        this.trace("set-local-description:start", {
          type: offer.type,
        });

        // FIXED: set local description with the answer, not the offer
        await this.peerConnection!.setLocalDescription(answer);

        this.trace("set-local-description:done");

        this.remoteDescriptionSet = true;

        for (const candidate of this.pendingIceCandidates) {
          await this.addIceCandidate(candidate);
        }

        this.pendingIceCandidates = [];

        return {
          type: "answer",
          sdp: answer.sdp!,
        };
      } catch (error) {
        this.logFailure("handleOffer failed", error);
        throw error;
      }
    });
  }

  async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) return;

    // ADDED: guard against wrong signaling state
    if (this.peerConnection.signalingState !== "have-local-offer") {
      webrtcLog.warn("webrtc › cannot set remote answer in state", {
        state: this.peerConnection?.signalingState,
      });
      return;
    }

    await this.enqueueNegotiation(async () => {
      try {
        await this.peerConnection!.setRemoteDescription(
          new RTCSessionDescription(answer)
        );

        this.remoteDescriptionSet = true;

        for (const candidate of this.pendingIceCandidates) {
          await this.addIceCandidate(candidate);
        }

        this.pendingIceCandidates = [];
      } catch (error) {
        webrtcLog.error("webrtc › handleAnswer failed", { error });
      }
    });
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.peerConnection) return;

    if (this.isIgnoringOffer) {
      this.trace("offer-ignored", {
        reason: "impolite-peer-collision",
      });
      webrtcLog.debug("webrtc › ignoring candidate (glare)");
      return;
    }

    if (!this.remoteDescriptionSet) {
      this.pendingIceCandidates.push(candidate);
      this.trace("ice-candidate:queued");
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      this.trace("ice-candidate:add", {
        queued: !this.remoteDescriptionSet,
      });
    } catch (error) {
      this.logFailure("addIceCandidate failed", error);
    }
  }

  setupDataChannel(channel: RTCDataChannel) {
    try {
      channel.onopen = () => {
        webrtcLog.info("webrtc › data channel open");
        this.emit("datachannel-open");

        if (this.peerConnection?.connectionState === "connected")
          this.emit("connection-established");
      };

      channel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
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

  sendDataMessage(payload: WebrtcDataMessage) {
    try {
      if (
        this.dataChannel &&
        this.dataChannel.readyState === "open" &&
        this.isConnected
      ) {
        webrtcLog.debug("webrtc › data send", { messageType: payload.type });
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

      if (this.remoteStream) {
        webrtcLog.info("webrtc › terminating remote stream");
        this.remoteStream.getTracks().forEach((track) => track.stop());
        this.remoteStream.release();
        this.remoteStream = undefined;
      }

      this.cleanup();
    } catch (error) {
      webrtcLog.error("webrtc › terminate failed", { error });
      throw error;
    }
  }

  toggleMic() {
    try {
      if (!this.audioTrack) throw Error("Audio track not initialized");
      this.audioTrack.enabled = !this.audioTrack.enabled;
      webrtcLog.debug("webrtc › mic toggled", {
        enabled: this.audioTrack.enabled,
      });
      return this.audioTrack.enabled;
    } catch (error) {
      webrtcLog.error("webrtc › mic toggle failed", { error });
      throw error;
    }
  }

  async toggleCamera(): Promise<boolean> {
    try {
      webrtcLog.debug("toggleCamera", this.videoTrack);

      if (!this.videoTrack) {
        const newStream = await mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { min: 640, ideal: 1280 },
            height: { min: 480, ideal: 720 },
            frameRate: { min: 30, ideal: 60 },
          },
        });

        const newVideoTrack = newStream.getVideoTracks()[0];
        if (!newVideoTrack) throw new Error("Failed to acquire video track");

        this.localStream?.addTrack(newVideoTrack);

        if (this.peerConnection) {
          const videoSender = this.peerConnection
            .getSenders()
            .find((s) => s.track?.kind === "video");
          if (videoSender) {
            await videoSender.replaceTrack(newVideoTrack);
          } else {
            this.peerConnection.addTrack(newVideoTrack, this.localStream!);
          }
        }

        this.videoTrack = newVideoTrack;
        webrtcLog.debug("webrtc › camera acquired and enabled");
        return true;
      }

      this.videoTrack.enabled = !this.videoTrack.enabled;
      webrtcLog.debug("webrtc › camera toggled", {
        enabled: this.videoTrack.enabled,
      });
      return this.videoTrack.enabled;
    } catch (error) {
      webrtcLog.error("webrtc › camera toggle failed", { error });
      throw error;
    }
  }

  async switchCamera(isFrontCamera: boolean) {
    try {
      if (!this.videoTrack) throw Error("Video track not initialized");
      webrtcLog.debug("webrtc › camera switch");

      // isFrontCamera=true means currently on front → switch to back ("environment")
      const newFacingMode = isFrontCamera ? "environment" : "user";

      // Acquire new stream BEFORE stopping old track to avoid black screen
      const newStream = await mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: newFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) throw new Error("Failed to acquire new video track");

      // Replace in peer connection while old track is still live
      if (this.peerConnection) {
        const videoSender = this.peerConnection
          .getSenders()
          .find((s) => s.track?.kind === "video");
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }
      }

      // Stop old track only after replacement is in place
      this.videoTrack.stop();
      this.videoTrack = newVideoTrack;

      // Rebuild local stream preserving audio track
      const audioTrack = this.localStream?.getAudioTracks()[0];
      const tracks: MediaStreamTrack[] = audioTrack
        ? [audioTrack, newVideoTrack]
        : [newVideoTrack];
      this.localStream = new MediaStream(tracks);

      this.emit("switch-cam", this.localStream);
    } catch (error) {
      webrtcLog.error("webrtc › camera switch failed", { error });
      throw error;
    }
  }

  private enqueueNegotiation<T>(task: () => Promise<T>): Promise<T> {
    const result = this.negotiationQueue.then(task);

    this.negotiationQueue = result
      .then(() => {})
      .catch((err) => {
        webrtcLog.warn("webrtc › negotiation task failed", { err });
      });

    return result;
  }

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

  getLocalStream() {
    try {
      if (!this.localStream) throw new Error("Local stream is undefined");
      return this.localStream;
    } catch (error) {
      webrtcLog.error("webrtc › local stream get failed", { error });
      throw error;
    }
  }

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

      // Properly close the data channel before discarding
      if (this.dataChannel) {
        this.dataChannel.close();
        this.dataChannel = undefined;
      }

      this.remoteStream = undefined;
      this.pendingIceCandidates = [];
      this.remoteDescriptionSet = false;
      this.videoTrack = undefined;
      this.audioTrack = undefined;
      this.resetIceRestartState();
      webrtcLog.info("webrtc › cleanup");
    } catch (error) {
      webrtcLog.error("webrtc › cleanup failed", { error });
      throw error;
    }
  }
}
