import { ChatService } from "@/features/chat/services/chat-service";
import { DataChatMessageI } from "@/features/chat/types";
import { connectionLog } from "@/features/shared/utils/logger";
import { MediaStream } from "react-native-webrtc";
import {
  TcpClientAdapter,
  TcpServerAdapter,
  WebrtcAdapter,
  WsSignalingAdapter,
} from "../adapters";
import { AppModeStore, NetworkConfig, UserStore } from "../stores";
import {
  CallControlData,
  CallMessage,
  DataAckMessage,
  Message,
  SignalingMessage,
} from "../types";
import { TypedEventEmitter } from "../utils/typed-event-emitter";
import { CallMediaService } from "./call-media-service";
import { SignalingService } from "./signaling-service";
import { WebrtcSessionManager } from "./webrtc-session-manager";

connectionLog.debug("[connection-service] module loaded");

export type ConnectionStatePayload = {
  peerId: string;
  state: "connecting" | "connected" | "failed" | "timeout";
  transport: "ws" | "tcp" | "none";
  mode: "auto" | "server" | "lan";
  error?: unknown;
};

export type ConnectionServiceEvents = {
  "audio-call": [peerId: string];
  "video-call": [peerId: string];
  "call-ended": [peerId: string];
  "call-ready": [peerId: string];
  "camera-off": [peerId: string];
  "camera-on": [peerId: string];
  "mic-off": [peerId: string];
  "mic-on": [peerId: string];
  remoteStream: [stream: MediaStream];
  "peer-reconnected": [peerId: string];
  "connection-state": [payload: ConnectionStatePayload];
};

/**
 * ConnectionService is the facade over WebrtcSessionManager, SignalingService, and
 * CallMediaService. It owns TCP transport, WS adapter event wiring, and the
 * connectToPeer / renegotiate orchestration.
 */
export class ConnectionService extends TypedEventEmitter<ConnectionServiceEvents> {
  private tcpClientAdapters: Map<string, TcpClientAdapter> = new Map();

  constructor(
    private readonly tcpServerAdapter: TcpServerAdapter,
    private readonly networkConfig: NetworkConfig,
    private readonly userStore: UserStore,
    private readonly appModeStore: AppModeStore,
    private readonly wsSignalingAdapter: WsSignalingAdapter,
    private readonly webrtcSessionManager: WebrtcSessionManager,
    private readonly signalingService: SignalingService,
    private readonly callMediaService: CallMediaService
  ) {
    super();

    connectionLog.info("connection › service constructed", {
      hasTcpServerAdapter: Boolean(tcpServerAdapter),
      hasNetworkConfig: Boolean(networkConfig),
      hasUserStore: Boolean(userStore),
      hasAppModeStore: Boolean(appModeStore),
      hasWsSignalingAdapter: Boolean(wsSignalingAdapter),
      hasWebrtcSessionManager: Boolean(webrtcSessionManager),
      hasSignalingService: Boolean(signalingService),
      hasCallMediaService: Boolean(callMediaService),
    });

    // Wire sub-services — ConnectionService is constructed last so all exist here.
    // Closures (not .bind) so jest.spyOn replacements on this instance are respected.
    this.signalingService.setTcpCallbacks(
      (peerId) => this.getTcpClientAdapter(peerId),
      (peerId, msg) => this.sendMessage(peerId, msg)
    );
    this.webrtcSessionManager.setSignalingSender((peerId, msg) =>
      this.signalingService.sendSignalingMessage(peerId, msg)
    );

    // Forward WebrtcSessionManager events onto ConnectionService.
    this.webrtcSessionManager.on("remoteStream", (stream) => {
      this.emit("remoteStream", stream);
    });
    this.webrtcSessionManager.on("peer-reconnected", (peerId) => {
      this.emit("peer-reconnected", peerId);
    });
    this.webrtcSessionManager.on("camera-on", (peerId) => {
      this.emit("camera-on", peerId);
    });
    this.webrtcSessionManager.on("camera-off", (peerId) => {
      this.emit("camera-off", peerId);
    });
    this.webrtcSessionManager.on("mic-on", (peerId) => {
      this.emit("mic-on", peerId);
    });
    this.webrtcSessionManager.on("mic-off", (peerId) => {
      this.emit("mic-off", peerId);
    });

    // WS adapter event listeners stay in ConnectionService (constraint).
    this.wsSignalingAdapter.on("message", async (message: SignalingMessage) => {
      try {
        if (!this.isWebSocketAllowed()) {
          connectionLog.warn("connection › ws message ignored", {
            ...this.summarizeSignalingMessage(message),
            source: "ws",
          });
          return;
        }
        connectionLog.debug("connection › ws message received", {
          ...this.summarizeSignalingMessage(message),
          source: "ws",
        });
        await this.signalingService.handleIncomingSignaling(message);
      } catch (error) {
        connectionLog.error("connection › ws message handling failed", {
          error,
        });
      }
    });

    this.wsSignalingAdapter.on("call-message", async (message: CallMessage) => {
      try {
        if (message.type === "audio-call") {
          this.emit("audio-call", message.data.from);
        }
        if (message.type === "video-call") {
          this.emit("video-call", message.data.from);
        }
        if (message.type === "call-ended") {
          // TODO: check if needed to reinitialize local stream
          // TODO: validate that the caller id is the sender
          connectionLog.info("connection › call ended", {
            peerId: message.data.from,
          });
          this.emit("call-ended", message.data.from);
        }
      } catch (error) {
        connectionLog.error("connection › call message handling failed", {
          error,
        });
      }
    });

    this.wsSignalingAdapter.on("reconnecting", ({ attempt, delayMs }) => {
      connectionLog.info("connection › ws reconnecting", {
        attempt,
        delayMs,
      });
    });

    this.wsSignalingAdapter.on("reconnect-failed", ({ attempts }) => {
      connectionLog.warn("connection › ws reconnect failed", { attempts });
    });

    this.wsSignalingAdapter.on("open", () => {
      connectionLog.info("connection › ws connected");
    });

    this.wsSignalingAdapter.on("close", ({ code, reason, wasClean }) => {
      connectionLog.warn("connection › ws closed", {
        code,
        reason,
        wasClean,
      });
    });

    this.wsSignalingAdapter.on("ws-error", (error) => {
      connectionLog.warn("connection › ws transport error", { error });
    });

    this.wsSignalingAdapter.on("raw-message", (payload) => {
      connectionLog.warn("connection › ws non-signaling payload", {
        payloadType: typeof payload,
      });
    });

    tcpServerAdapter.on("data", async (message: Message) => {
      try {
        if (!this.isTcpAllowed()) {
          connectionLog.warn("connection › tcp message ignored", {
            type: message.type,
          });
          return;
        }
        connectionLog.debug("connection › tcp message received", {
          type: message.type,
        });
        if (
          message.type === "ice-candidate" ||
          message.type === "offer" ||
          message.type === "answer" ||
          message.type === "handshake"
        ) {
          await this.signalingService.handleIncomingSignaling(message);
        }
        if (message.type === "audio-call" && "from" in message.data) {
          this.emit("audio-call", message.data.from);
        }
        if (message.type === "video-call" && "from" in message.data) {
          this.emit("video-call", message.data.from);
        }
        if (message.type === "call-ended" && "from" in message.data) {
          // TODO: check if needed to reinitialize local stream
          // TODO: validate that the caller id is the sender
          connectionLog.info("connection › call ended", {
            peerId: message.data.from,
          });
          this.emit("call-ended", message.data.from);
        }
        if (message.type === "call-ready" && "from" in message.data) {
          this.emit("call-ready", message.data.from);
        }
      } catch (error) {
        connectionLog.error("connection › tcp handler failed", { error });
      }
    });
  }

  /**
   * Sets JWT token used by websocket signaling transport.
   */
  setSignalingToken(token?: string) {
    this.signalingService.setSignalingToken(token);
  }

  /**
   * Sets the chat service. Propagates into WebrtcSessionManager after construction.
   */
  setChatService(chatService: ChatService) {
    this.webrtcSessionManager.setChatService(chatService);
  }

  /**
   * Retrieves or creates a TcpClientAdapter for the given peer.
   * Stays in ConnectionService per design constraint.
   */
  getTcpClientAdapter(peerId: string): TcpClientAdapter {
    try {
      let adapter = this.tcpClientAdapters.get(peerId);
      if (!adapter) {
        adapter = new TcpClientAdapter(peerId);
        this.tcpClientAdapters.set(peerId, adapter);
        connectionLog.debug("connection › tcp client created", { peerId });
      }
      return adapter;
    } catch (error) {
      connectionLog.error("connection › tcp client get failed", {
        peerId,
        error,
      });
      throw error;
    }
  }

  /**
   * Delegates to WebrtcSessionManager.
   */
  getWebrtcAdapter(peerId: string): WebrtcAdapter {
    return this.webrtcSessionManager.getWebrtcAdapter(peerId);
  }

  /**
   * Starts the TCP server and initializes the WS signaling connection.
   */
  start() {
    try {
      if (this.isTcpAllowed()) {
        this.tcpServerAdapter.start(this.networkConfig.port);
      }
      if (this.isWebSocketAllowed()) {
        this.signalingService.ensureWsSignaling();
      }
    } catch (error) {
      connectionLog.error("connection › start failed", { error });
      throw error;
    }
  }

  /**
   * Initiates connection to a peer using TCP and WebRTC.
   */
  async connectToPeer(peerId: string, ipAddress?: string, port?: number) {
    connectionLog.info("connection › connect start", {
      peerId,
      hasIpAddress: Boolean(ipAddress),
      hasPort: Boolean(port),
    });
    const tcpAdapter = this.getTcpClientAdapter(peerId);
    const webrtcAdapter = this.webrtcSessionManager.getWebrtcAdapter(peerId);
    const effectiveMode = this.appModeStore.getEffectiveMode(
      this.userStore.isGuest
    );
    const canUseWebsocket = this.isWebSocketAllowed();
    const canUseTcp = this.isTcpAllowed();
    const isWsConfigured = canUseWebsocket
      ? this.signalingService.ensureWsSignaling()
      : false;
    const signalingTransport: "ws" | "tcp" | "none" = isWsConfigured
      ? "ws"
      : canUseTcp
      ? "tcp"
      : "none";

    connectionLog.debug("connection › signaling availability", {
      peerId,
      tcpConnected: tcpAdapter.isConnected,
      websocketConfigured: isWsConfigured,
      mode: effectiveMode,
    });

    if (webrtcAdapter.isConnected) {
      connectionLog.info("connection › already connected", { peerId });
      this.emit("connection-state", {
        peerId,
        state: "connected",
        transport: signalingTransport,
        mode: effectiveMode,
      });
      return;
    }

    let isTcpConnected = tcpAdapter.isConnected;

    if (effectiveMode === "server") {
      if (!isWsConfigured) {
        throw new Error("Websocket signaling is required in server mode");
      }
    } else if (effectiveMode === "lan") {
      if (!canUseTcp) {
        throw new Error("TCP transport is required in lan mode");
      }
      if (!isTcpConnected) {
        if (!ipAddress || !port) {
          throw new Error("TCP connection requires ipAddress and port");
        }
        await tcpAdapter.connect(ipAddress, port);
        isTcpConnected = true;
      }
    } else {
      if (!isWsConfigured && canUseTcp && !isTcpConnected) {
        if (ipAddress && port) {
          try {
            await tcpAdapter.connect(ipAddress, port);
            isTcpConnected = true;
          } catch (error) {
            connectionLog.warn("connection › tcp connect failed", {
              peerId,
              error,
            });
            throw error;
          }
        } else if (!isWsConfigured) {
          throw new Error("No signaling transport available in auto mode");
        }
      }
    }

    return new Promise<void>((resolve, reject) => {
      let isSettled = false;
      let timeout: ReturnType<typeof setTimeout>;
      const timeoutMs =
        effectiveMode === "lan"
          ? 7000
          : effectiveMode === "server"
          ? 15000
          : 10000;

      this.emit("connection-state", {
        peerId,
        state: "connecting",
        transport: signalingTransport,
        mode: effectiveMode,
      });

      const removeListenerIfExists = (
        eventName: string,
        callback: (...args: unknown[]) => void
      ) => {
        const adapterWithListeners = webrtcAdapter as unknown as {
          off?: (event: string, cb: (...args: unknown[]) => void) => void;
          removeListener?: (
            event: string,
            cb: (...args: unknown[]) => void
          ) => void;
        };
        if (typeof adapterWithListeners.off === "function") {
          adapterWithListeners.off(eventName, callback);
          return;
        }
        if (typeof adapterWithListeners.removeListener === "function") {
          adapterWithListeners.removeListener(eventName, callback);
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        removeListenerIfExists(
          "connection-established",
          onConnectionEstablished
        );
        removeListenerIfExists("connection-failed", onConnectionFailed);
      };

      const onConnectionEstablished = () => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        connectionLog.info("connection › webrtc connected", { peerId });
        this.emit("connection-state", {
          peerId,
          state: "connected",
          transport: signalingTransport,
          mode: effectiveMode,
        });
        resolve();
      };

      const onConnectionFailed = (error: unknown) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        connectionLog.error("connection › webrtc connection failed", {
          peerId,
          error,
        });
        this.emit("connection-state", {
          peerId,
          state: "failed",
          transport: signalingTransport,
          mode: effectiveMode,
          error,
        });
        reject(error);
      };

      webrtcAdapter.once("connection-established", onConnectionEstablished);
      webrtcAdapter.once("connection-failed", onConnectionFailed);

      timeout = setTimeout(() => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        connectionLog.warn("connection › connect timeout", {
          peerId,
          timeoutMs,
        });
        this.emit("connection-state", {
          peerId,
          state: "timeout",
          transport: signalingTransport,
          mode: effectiveMode,
        });
        reject(new Error("Connection timeout"));
      }, timeoutMs);

      webrtcAdapter
        .createOffer()
        .then(({ type, sdp }) => {
          connectionLog.debug("connection › webrtc offer created", {
            peerId,
            type,
            hasSdp: Boolean(sdp),
          });
          // Handshake is only needed for direct TCP fallback routing.
          if (isTcpConnected) {
            connectionLog.debug("connection › tcp handshake sent", { peerId });
            this.sendMessage(peerId, {
              type: "handshake",
              data: { ...this.buildSignalSenderData(peerId) },
            });
          }
          this.signalingService.sendSignalingMessage(peerId, {
            type,
            data: {
              sdp: { type, sdp },
              ...this.buildSignalSenderData(peerId),
            },
          });
        })
        .catch((error) => {
          connectionLog.warn("connection › connect failed", {
            peerId,
            hasIpAddress: Boolean(ipAddress),
            hasPort: Boolean(port),
            error,
          });
          this.emit("connection-state", {
            peerId,
            state: "failed",
            transport: signalingTransport,
            mode: effectiveMode,
            error,
          });
          reject(error);
        });
    });
  }

  /**
   * Renegotiates the WebRTC connection with the specified peer.
   */
  async renegotiate(peerId: string) {
    try {
      connectionLog.info("connection › renegotiation requested", { peerId });
      const tcpAdapter = this.getTcpClientAdapter(peerId);
      const webrtcAdapter = this.webrtcSessionManager.getWebrtcAdapter(peerId);
      const isWsConfigured = this.signalingService.ensureWsSignaling();

      if (!webrtcAdapter.isConnected) {
        throw new Error("Webrtc not connected");
      }
      if (!tcpAdapter.isConnected && !isWsConfigured) {
        throw new Error("No signaling transport available");
      }

      const { type, sdp } = await webrtcAdapter.createOffer();
      connectionLog.debug("connection › renegotiation offer created", {
        peerId,
        type,
        hasSdp: Boolean(sdp),
      });
      this.signalingService.sendSignalingMessage(peerId, {
        type,
        data: {
          sdp: { type, sdp },
          ...this.buildSignalSenderData(peerId),
        },
      });
    } catch (error) {
      connectionLog.error("connection › renegotiation failed", {
        peerId,
        error,
      });
      throw error;
    }
  }

  waitForDataChannel(peerId: string, timeoutMs = 5000): Promise<void> {
    return this.webrtcSessionManager.waitForDataChannel(peerId, timeoutMs);
  }

  /**
   * Sends a message to the specified peer via TCP.
   */
  sendMessage(peerId: string, message: Message) {
    try {
      if (!this.isTcpAllowed()) {
        connectionLog.warn("connection › tcp message blocked", {
          peerId,
          type: message.type,
        });
        return;
      }
      connectionLog.debug("connection › tcp message sent", {
        peerId,
        type: message.type,
      });
      const adapter = this.getTcpClientAdapter(peerId);
      if (adapter.isConnected) {
        adapter.sendMessage(message);
        return;
      }
      connectionLog.warn("connection › tcp not connected", {
        peerId,
        type: message.type,
      });
    } catch (error) {
      connectionLog.error("connection › tcp send failed", {
        peerId,
        type: message.type,
        error,
      });
      throw error;
    }
  }

  sendCallMessage(peerId: string, message: CallMessage) {
    this.signalingService.sendCallMessage(peerId, message);
  }

  // TODO: Make tcp as fallback once webrtc failed
  sendChatMessage(peerId: string, messageData: DataChatMessageI) {
    this.webrtcSessionManager.sendChatMessage(peerId, messageData);
  }

  // TODO: make tcp as fallback
  sendAckMessage(peerId: string, ackData: DataAckMessage) {
    this.webrtcSessionManager.sendAckMessage(peerId, ackData);
  }

  sendCallControlMessage(
    peerId: string,
    type: "camera_toggle" | "mic_toggle",
    callControlData: CallControlData
  ) {
    this.webrtcSessionManager.sendCallControlMessage(
      peerId,
      type,
      callControlData
    );
  }

  async initializeStream(stream: "audio" | "video", peerId: string) {
    return this.callMediaService.initializeStream(stream, peerId);
  }

  terminateCallConnection(peerId: string) {
    this.callMediaService.terminateCallConnection(peerId);
    this.webrtcSessionManager.evictWebrtcAdapter(peerId);
  }

  toggleMic(peerId: string) {
    const res = this.callMediaService.toggleMic(peerId);
    this.sendCallControlMessage(peerId, "mic_toggle", {
      from: this.userStore.user.id,
      enabled: res,
    });
  }

  toggleCamera(peerId: string) {
    const res = this.callMediaService.toggleCamera(peerId);
    this.sendCallControlMessage(peerId, "camera_toggle", {
      from: this.userStore.user.id,
      enabled: res,
    });
  }

  getLocalStream(peerId: string) {
    return this.callMediaService.getLocalStream(peerId);
  }

  /**
   * Stops all connections and cleans up resources.
   */
  stop() {
    try {
      connectionLog.info("connection › stop", {
        tcpClientAdapters: this.tcpClientAdapters.size,
      });
      this.webrtcSessionManager.cleanupAll();
      this.tcpClientAdapters.forEach((client) => client.disconnect());
      this.tcpServerAdapter.stop();
      this.wsSignalingAdapter.disconnect();
      this.removeAllListeners();
    } catch (error) {
      connectionLog.error("connection › stop failed", { error });
      throw error;
    }
  }

  /**
   * Stops TCP transport while keeping WebRTC/WebSocket state intact.
   */
  stopTcpTransport() {
    try {
      connectionLog.info("connection › tcp stop", {
        tcpClientAdapters: this.tcpClientAdapters.size,
      });
      this.tcpClientAdapters.forEach((client) => client.disconnect());
      this.tcpServerAdapter.stop();
    } catch (error) {
      connectionLog.error("connection › tcp stop failed", { error });
      throw error;
    }
  }

  isWebrtcConnected(peerId: string) {
    const adapter = this.getWebrtcAdapter(peerId);
    return adapter.isConnected;
  }

  private buildSignalSenderData(to: string) {
    const id = this.userStore.user.id;
    return {
      to,
      from: id,
      sender: id,
      ipAddress: this.networkConfig.ipAddress,
      port: this.networkConfig.port,
    };
  }

  private isTcpAllowed(): boolean {
    return this.appModeStore.isTcpAllowed(this.userStore.isGuest);
  }

  private isWebSocketAllowed(): boolean {
    return this.appModeStore.isWebSocketAllowed(this.userStore.isGuest);
  }

  private summarizeSignalingMessage(message: SignalingMessage) {
    return {
      messageType: message.type,
      to: message.data.to,
      sender: message.data.sender,
    };
  }
}
