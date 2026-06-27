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
import { WebrtcDataMessage } from "../../types";
import { webrtcLog } from "../../core/utils/logger";
import { IceRestartController } from "./ice-restart-controller";
import { LivenessMonitor } from "./liveness-monitor";

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

  private isMakingOffer = false;
  private negotiationQueue: Promise<void> = Promise.resolve();

  // ICE-restart backoff — managed by IceRestartController.
  private readonly iceRestart: IceRestartController;
  // Application-level liveness probe — managed by LivenessMonitor.
  private readonly liveness: LivenessMonitor;

  private remoteDescriptionSet: boolean = false;
  private audioTrack?: MediaStreamTrack;
  private videoTrack?: MediaStreamTrack;
  private isDisposed = false;

  readonly peerId: string;
  private isPolite: boolean = false;
  private isIgnoringOffer = false;

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
    this.iceRestart = new IceRestartController({
      createRestartOffer: () =>
        this.enqueueNegotiation(async () => {
          if (!this.peerConnection) throw new Error("no peer connection");
          const sigState = this.peerConnection.signalingState;
          if (sigState === "have-local-offer") {
            webrtcLog.info("webrtc › rolling back unanswered offer before ice restart");
            await this.peerConnection.setLocalDescription(
              new RTCSessionDescription({ type: "rollback", sdp: "" })
            );
            this.isMakingOffer = false;
          } else if (sigState !== "stable") {
            webrtcLog.warn("webrtc › skip ice restart (not stable)", { signalingState: sigState });
            throw new Error("not stable");
          }
          webrtcLog.info("webrtc › ice restart");
          this.trace("create-offer:start");
          const offer = await this.peerConnection.createOffer({ iceRestart: true });
          this.trace("create-offer:success", { sdpLength: offer.sdp?.length });
          this.trace("set-local-description:start", { type: offer.type });
          await this.peerConnection.setLocalDescription(offer);
          this.remoteDescriptionSet = false;
          this.trace("set-local-description:done");
          return { type: "offer", sdp: offer.sdp! };
        }),
      emitSignalOffer: (offer) => this.emit("signal-offer", offer),
      emitIceRestarting: () => this.emit("ice-restarting"),
      emitConnectionFailed: (error) => this.emit("connection-failed", error),
      log: (m, d) => this.trace(m, d as Record<string, unknown>),
    });
    this.liveness = new LivenessMonitor({
      send: (frame) => {
        if (this.dataChannel?.readyState === "open") {
          this.dataChannel.send(JSON.stringify(frame));
        }
      },
      onLivenessLost: () => this.iceRestart.scheduleIceRestart("failed", true),
      onLivenessRestored: () => {
        this.iceRestart.resetIceRestartState();
        this.emit("liveness-restored");
      },
      log: (m, d) => this.trace(m, d as Record<string, unknown>),
    });
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

  async initializeLocalStreamEarly(audio = false, video = false) {
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
      webrtcLog.debug("initializeLocalStreamEarly done", { hasVideo: video });
    } catch (error) {
      this.logFailure("initializeLocalStreamEarly failed", error);
      throw error;
    }
  }

  async initializeLocalStream(audio = false, video = false) {
    try {
      if (!this.localStream) {
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
      }

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
        const connState = this.peerConnection?.connectionState;
        webrtcLog.info("webrtc › connection state", { state: connState, peerId: this.peerId });

        switch (connState) {
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
            webrtcLog.warn("webrtc › connection state failed", { peerId: this.peerId, iceState: this.peerConnection?.iceConnectionState });
            // Only emit directly for DTLS/transport failures where iceConnectionState is
            // still healthy. When ICE itself fails, iceConnectionState → "failed" fires too
            // and scheduleIceRestart already owns recovery + final connection-failed emission.
            // Emitting here on an ICE failure would evict the adapter before restart can run.
            if (this.peerConnection?.iceConnectionState !== "failed") {
              this.emit("connection-failed", new Error("RTCPeerConnection failed"));
            }
            break;
        }
      };

      this.peerConnection.ondatachannel = (event) => {
        webrtcLog.debug("webrtc › data channel received");
        this.setDataChannel(event.channel);
      };

      this.peerConnection.oniceconnectionstatechange = (_event) => {
        const iceState = this.peerConnection?.iceConnectionState;
        webrtcLog.info("webrtc › ice state", { state: iceState, peerId: this.peerId, restartAttempts: this.iceRestart.attempts });

        switch (iceState) {
          case "connected":
          case "completed": {
            const wasReconnecting = this.iceRestart.attempts > 0;
            this.iceRestart.resetIceRestartState();
            if (wasReconnecting) {
              webrtcLog.info("webrtc › ice reconnected after restart");
              this.emit("ice-reconnected");
              // Re-push the existing remote stream so the UI can refresh its RTCView.
              // ontrack does not re-fire on a pure ICE restart, so without this the
              // video pane stays blank after reconnect.
              if (this.remoteStream && this.remoteStream.getTracks().length > 0) {
                webrtcLog.info("webrtc › re-emitting remote stream after reconnect", {
                  trackCount: this.remoteStream.getTracks().length,
                });
                this.emit("remoteStream", this.remoteStream);
              } else {
                webrtcLog.warn("webrtc › no remote stream to re-emit after reconnect");
              }
            }
            if (this.peerConnection?.iceConnectionState === "connected") {
              webrtcLog.info("webrtc › ice connected");
            }
            if (this.peerConnection?.iceConnectionState === "completed") {
              webrtcLog.info("webrtc › ice completed");
            }
            break;
          }
          case "disconnected":
            this.iceRestart.scheduleIceRestart("disconnected");
            break;
          case "failed":
            this.iceRestart.scheduleIceRestart("failed", true);
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
            this.remoteDescriptionSet = false;

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

    if (!this.dataChannel) {
      const channel = this.peerConnection!.createDataChannel(
        "chat"
      ) as unknown as RTCDataChannel;
      this.dataChannel = channel;
      this.setupDataChannel(channel);
    }

    return this.enqueueNegotiation(async () => {
      // A stale, unanswered local offer (e.g. left over from before a network
      // blip) leaves the PC in "have-local-offer"; calling createOffer() on it
      // throws E_OPERATION_ERROR. Roll it back so we can produce a fresh offer —
      // mirrors the guard in restartIce().
      if (this.peerConnection!.signalingState === "have-local-offer") {
        this.trace("rollback-stale-offer");
        await this.peerConnection!.setLocalDescription(
          new RTCSessionDescription({ type: "rollback", sdp: "" })
        );
        this.isMakingOffer = false;
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
        this.remoteDescriptionSet = false;

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
    });
  }

  async handleOffer(
    offer: RTCSessionDescriptionInit
  ): Promise<{ type: "answer"; sdp: string } | undefined> {
    if (this.isDisposed) return undefined;
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
        if (pc.signalingState !== "stable") {
          if (!(this.isPolite && pc.signalingState === "have-local-offer")) {
            webrtcLog.warn("webrtc › not stable, skipping offer", {
              signalingState: pc.signalingState,
              isPolite: this.isPolite,
            });
            return;
          }
          await pc.setLocalDescription(
            new RTCSessionDescription({ type: "rollback", sdp: "" })
          );
          this.isMakingOffer = false;
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
    if (this.isDisposed) return;
    if (!this.peerConnection) return;

    await this.enqueueNegotiation(async () => {
      if (this.peerConnection?.signalingState !== "have-local-offer") {
        webrtcLog.warn("webrtc › cannot set remote answer in state", {
          state: this.peerConnection?.signalingState,
        });
        return;
      }

      try {
        await this.peerConnection!.setRemoteDescription(
          new RTCSessionDescription(answer)
        );

        this.remoteDescriptionSet = true;
        this.isIgnoringOffer = false;

        for (const candidate of this.pendingIceCandidates) {
          await this.addIceCandidate(candidate);
        }

        this.pendingIceCandidates = [];
      } catch (error) {
        webrtcLog.error("webrtc › handleAnswer failed", { error });
        this.emit("connection-failed", error);
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
        this.liveness.start();

        if (this.peerConnection?.connectionState === "connected")
          this.emit("connection-established");
      };

      channel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          // Liveness frames are handled internally and never propagate to chat.
          if (message?.type === "ping") {
            this.liveness.handlePing(message?.data?.nonce);
            return;
          }
          if (message?.type === "pong") {
            this.liveness.handlePong();
            return;
          }
          this.emit("receivedMessage", message);
        } catch (error) {
          webrtcLog.error("webrtc › data channel parse failed", { error });
        }
      };

      channel.onerror = (error) => {
        this.liveness.stop();
        this.emit("connection-failed", error);
      };

      channel.onclose = () => {
        webrtcLog.info("webrtc › data channel closed");
        this.liveness.stop();
        this.emit("connection-closed");
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
    const guarded = (): Promise<T> => {
      if (this.isDisposed) return Promise.resolve(undefined as unknown as T);
      return task();
    };

    const result = this.negotiationQueue.then(guarded);

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
      this.isDisposed = true;

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
      this.iceRestart.resetIceRestartState();
      this.liveness.stop();
      webrtcLog.info("webrtc › cleanup");
    } catch (error) {
      webrtcLog.error("webrtc › cleanup failed", { error });
      throw error;
    }
  }
}
