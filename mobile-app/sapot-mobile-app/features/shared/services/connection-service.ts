import { ChatService } from "@/features/chat/services/chat-service";
import { DataChatMessageI } from "@/features/chat/types";
import { MediaStream } from "react-native-webrtc";
import {
  TcpClientAdapter,
  TcpServerAdapter,
  WebrtcAdapter,
  WsSignalingAdapter,
} from "../adapters";
import { AppModeStore, NetworkConfig, UserStore } from "../stores";
import {
  CallMessage,
  DataAckMessage,
  Message,
  SignalingMessage,
} from "../types";
import { TypedEventEmitter } from "../utils/typed-event-emitter";
import { CallMediaService } from "./call-media-service";
import { SignalingService } from "./signaling-service";
import { WebrtcSessionManager } from "./webrtc-session-manager";

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
  private readonly logPrefix = "[ConnectionService]";

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

    // Wire sub-services — ConnectionService is constructed last so all exist here.
    // Closures (not .bind) so jest.spyOn replacements on this instance are respected.
    this.signalingService.setTcpCallbacks(
      (peerId) => this.getTcpClientAdapter(peerId),
      (peerId, msg) => this.sendMessage(peerId, msg)
    );
    this.webrtcSessionManager.setSignalingSender(
      (peerId, msg) => this.signalingService.sendSignalingMessage(peerId, msg)
    );

    // Forward WebrtcSessionManager events onto ConnectionService.
    this.webrtcSessionManager.on("remoteStream", (stream) => {
      this.emit("remoteStream", stream);
    });
    this.webrtcSessionManager.on("peer-reconnected", (peerId) => {
      this.emit("peer-reconnected", peerId);
    });

    // WS adapter event listeners stay in ConnectionService (constraint).
    this.wsSignalingAdapter.on("message", async (message: SignalingMessage) => {
      try {
        if (!this.isWebSocketAllowed()) {
          console.warn(
            `${this.logPrefix}: Ignoring websocket signaling message (mode disabled)`,
            { ...this.summarizeSignalingMessage(message), source: "ws" }
          );
          return;
        }
        console.log(
          `${this.logPrefix}: Signaling message received from websocket`,
          { ...this.summarizeSignalingMessage(message), source: "ws" }
        );
        await this.signalingService.handleIncomingSignaling(message);
      } catch (error) {
        console.error(
          `${this.logPrefix}: Error handling websocket signaling message`,
          error
        );
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
          console.log("call ended");
          this.emit("call-ended", message.data.from);
        }
      } catch (error) {
        console.error(`${this.logPrefix}: Error handling call message`, error);
      }
    });

    this.wsSignalingAdapter.on("reconnecting", ({ attempt, delayMs }) => {
      console.log(
        `${this.logPrefix}: Reconnecting websocket signaling (attempt ${attempt}) in ${delayMs}ms`
      );
    });

    this.wsSignalingAdapter.on("reconnect-failed", ({ attempts }) => {
      console.warn(
        `${this.logPrefix}: Websocket signaling reconnect failed after ${attempts} attempts`
      );
    });

    this.wsSignalingAdapter.on("open", () => {
      console.log(`${this.logPrefix}: Websocket signaling connected`);
    });

    this.wsSignalingAdapter.on("close", ({ code, reason, wasClean }) => {
      console.warn(`${this.logPrefix}: Websocket signaling closed`, {
        code,
        reason,
        wasClean,
      });
    });

    this.wsSignalingAdapter.on("ws-error", (error) => {
      console.warn(
        `${this.logPrefix}: Websocket signaling transport error`,
        error
      );
    });

    this.wsSignalingAdapter.on("raw-message", (payload) => {
      console.warn(
        `${this.logPrefix}: Received raw/non-signaling websocket payload`,
        { payloadType: typeof payload }
      );
    });

    tcpServerAdapter.on("data", async (message: Message) => {
      try {
        if (!this.isTcpAllowed()) {
          console.warn(
            `${this.logPrefix}: Ignoring TCP payload (mode disabled)`,
            { type: message.type }
          );
          return;
        }
        console.log(`${this.logPrefix}: TCP data received`, {
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
          console.log("call ended");
          this.emit("call-ended", message.data.from);
        }
      } catch (error) {
        console.error(`${this.logPrefix}: Error in TCP data handler`, error);
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
        console.log(`${this.logPrefix}: Created TCP client adapter`, { peerId });
      }
      return adapter;
    } catch (error) {
      console.error(
        `${this.logPrefix}: Error getting TCP client adapter\n${JSON.stringify(
          { peerId },
          null,
          2
        )}\n${error}`
      );
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
      console.error(`${this.logPrefix}: Error starting connection`, error);
      throw error;
    }
  }

  /**
   * Initiates connection to a peer using TCP and WebRTC.
   */
  async connectToPeer(peerId: string, ipAddress?: string, port?: number) {
    console.log(`${this.logPrefix}: connectToPeer started`, {
      peerId,
      ipAddress,
      port,
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

    console.log(`${this.logPrefix}: Signaling transport availability`, {
      peerId,
      tcpConnected: tcpAdapter.isConnected,
      websocketConfigured: isWsConfigured,
      mode: effectiveMode,
    });

    if (webrtcAdapter.isConnected) {
      console.log(
        `${this.logPrefix}: Peer already has active WebRTC connection`,
        { peerId }
      );
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
            console.warn(
              `${this.logPrefix}: TCP connect failed; no websocket available`,
              error
            );
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
        console.log(`${this.logPrefix}: WebRTC connection established`, {
          peerId,
        });
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
        console.error(`${this.logPrefix}: WebRTC connection failed`, {
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
        console.warn(`${this.logPrefix}: connectToPeer timeout`, {
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
          console.log(`${this.logPrefix}: Created WebRTC offer`, {
            peerId,
            type,
            hasSdp: Boolean(sdp),
          });
          // Handshake is only needed for direct TCP fallback routing.
          if (isTcpConnected) {
            console.log(`${this.logPrefix}: Sending TCP handshake`, {
              peerId,
              ipAddress: this.networkConfig.ipAddress,
              port: this.networkConfig.port,
            });
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
          console.warn(
            `${this.logPrefix}: Error connecting to peer\n${JSON.stringify(
              { peerId, ipAddress, port },
              null,
              2
            )}\n${error}`
          );
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
      console.log(`${this.logPrefix}: Renegotiation requested`, { peerId });
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
      console.log(`${this.logPrefix}: Renegotiation offer created`, {
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
      console.error(
        `${this.logPrefix}: Error renegotiating\n${JSON.stringify(
          { peerId },
          null,
          2
        )}\n${error}`
      );
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
        console.warn(
          `${this.logPrefix}: TCP message blocked (mode disabled)`,
          { peerId, type: message.type }
        );
        return;
      }
      console.log(`${this.logPrefix}: Sending TCP message`, {
        peerId,
        type: message.type,
      });
      const adapter = this.getTcpClientAdapter(peerId);
      if (adapter.isConnected) {
        adapter.sendMessage(message);
        return;
      }
      console.warn(
        `${this.logPrefix}: TCP adapter not connected, message not sent`,
        { peerId, type: message.type }
      );
    } catch (error) {
      console.error(
        `${this.logPrefix}: Error sending message\n${JSON.stringify(
          { peerId, ...message },
          null,
          2
        )}\n${error}`
      );
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

  async initializeStream(stream: "audio" | "video", peerId: string) {
    return this.callMediaService.initializeStream(stream, peerId);
  }

  terminateCallConnection(peerId: string) {
    this.callMediaService.terminateCallConnection(peerId);
  }

  toggleMic(peerId: string) {
    this.callMediaService.toggleMic(peerId);
  }

  toggleCamera(peerId: string) {
    this.callMediaService.toggleCamera(peerId);
  }

  getLocalStream(peerId: string) {
    return this.callMediaService.getLocalStream(peerId);
  }

  /**
   * Stops all connections and cleans up resources.
   */
  stop() {
    try {
      console.log(`${this.logPrefix}: Stopping connection service`, {
        tcpClientAdapters: this.tcpClientAdapters.size,
      });
      this.webrtcSessionManager.cleanupAll();
      this.tcpClientAdapters.forEach((client) => client.disconnect());
      this.tcpServerAdapter.stop();
      this.wsSignalingAdapter.disconnect();
      this.removeAllListeners();
    } catch (error) {
      console.error(`${this.logPrefix}: Error performing stop`, error);
      throw error;
    }
  }

  /**
   * Stops TCP transport while keeping WebRTC/WebSocket state intact.
   */
  stopTcpTransport() {
    try {
      console.log(`${this.logPrefix}: Stopping TCP transport`, {
        tcpClientAdapters: this.tcpClientAdapters.size,
      });
      this.tcpClientAdapters.forEach((client) => client.disconnect());
      this.tcpServerAdapter.stop();
    } catch (error) {
      console.error(
        `${this.logPrefix}: Error stopping TCP transport`,
        error
      );
      throw error;
    }
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
