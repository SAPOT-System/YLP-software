import { getWsUrl } from "@/config/runtime";
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
  DataAckMessage,
  SignalingMessage,
  Message,
  WebrtcDataMessage,
  CallMessage,
} from "../types";
import { TypedEventEmitter } from "../utils/typed-event-emitter";

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
  "call-ended": [];
  remoteStream: [stream: MediaStream];
  "peer-reconnected": [peerId: string];
  "connection-state": [payload: ConnectionStatePayload];
};

/**
 * ConnectionService handles peer-to-peer connections, message routing, and event management
 * for both TCP and WebRTC communication in the app.
 *
 * @remarks
 * - Handles signaling and data messages
 * - Emits events for call and stream management
 * - Ensures resource cleanup and robust error handling
 */
export class ConnectionService extends TypedEventEmitter<ConnectionServiceEvents> {
  private tcpClientAdapters: Map<string, TcpClientAdapter> = new Map();
  private chatService?: ChatService;
  private webrtcAdapters: Map<string, WebrtcAdapter> = new Map();
  private signalingToken?: string;
  private currentWsTargetId?: string;
  private readonly logPrefix = "[ConnectionService]";

  constructor(
    private tcpServerAdapter: TcpServerAdapter,
    private networkConfig: NetworkConfig,
    private userStore: UserStore,
    private appModeStore: AppModeStore,
    private wsSignalingAdapter: WsSignalingAdapter,
    private wsBaseUrl: string = getWsUrl()
  ) {
    super();

    this.wsSignalingAdapter.on("message", async (message: SignalingMessage) => {
      try {
        if (!this.isWebSocketAllowed()) {
          console.warn(
            `${this.logPrefix}: Ignoring websocket signaling message (mode disabled)`,
            {
              ...this.summarizeSignalingMessage(message),
              source: "ws",
            }
          );
          return;
        }
        console.log(
          `${this.logPrefix}: Signaling message received from websocket`,
          {
            ...this.summarizeSignalingMessage(message),
            source: "ws",
          }
        );
        await this.handleWebrtcConnection(message);
      } catch (error) {
        console.error(
          "[ConnectionService]: Error handling websocket signaling message",
          error
        );
      }
    });

    this.wsSignalingAdapter.on("call-message", async (message: CallMessage) => {
      try {
        if (message.type === "audio-call") {
          await this.initializeStream("audio", message.data.from);
          this.emit("audio-call", message.data.from);
        }

        if (message.type === "video-call") {
          await this.initializeStream("video", message.data.from);
          this.emit("video-call", message.data.from);
        }

        if (message.type === "call-ended") {
          // TODO: check if needed to reinitialize local stream
          // TODO: validate that the caller id is the sender
          console.log("call ended");
          this.emit("call-ended");
        }
      } catch (error) {
        console.error(
          "[ConnectionService]: Error handling call message",
          error
        );
      }
    });

    this.wsSignalingAdapter.on("reconnecting", ({ attempt, delayMs }) => {
      console.log(
        `[ConnectionService]: Reconnecting websocket signaling (attempt ${attempt}) in ${delayMs}ms`
      );
    });

    this.wsSignalingAdapter.on("reconnect-failed", ({ attempts }) => {
      console.warn(
        `[ConnectionService]: Websocket signaling reconnect failed after ${attempts} attempts`
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
        {
          payloadType: typeof payload,
        }
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
        // Type narrowing for signaling messages
        if (
          message.type === "ice-candidate" ||
          message.type === "offer" ||
          message.type === "answer" ||
          message.type === "handshake"
        ) {
          await this.handleWebrtcConnection(message);
        }
        // TODO: soon, implement tcp for fallback of webrtc

        if (message.type === "audio-call" && "from" in message.data) {
          await this.initializeStream("audio", message.data.from);
          this.emit("audio-call", message.data.from);
        }

        if (message.type === "video-call" && "from" in message.data) {
          await this.initializeStream("video", message.data.from);
          this.emit("video-call", message.data.from);
        }

        if (message.type === "call-ended" && "from" in message.data) {
          // TODO: check if needed to reinitialize local stream
          // TODO: validate that the caller id is the sender
          console.log("call ended");
          this.emit("call-ended");
        }
      } catch (error) {
        console.error("[ConnectionService]: Error in TCP data handler", error);
      }
    });
  }

  /**
   * Sets JWT token used by websocket signaling transport.
   */
  setSignalingToken(token?: string) {
    this.signalingToken = token || undefined;
    console.log(`${this.logPrefix}: Updated signaling token`, {
      hasToken: Boolean(this.signalingToken),
    });

    if (!this.isWebSocketAllowed() && this.wsSignalingAdapter.isConnected) {
      console.log(
        `${this.logPrefix}: Websocket signaling disabled by mode, disconnecting`
      );
      this.wsSignalingAdapter.disconnect();
      this.currentWsTargetId = undefined;
      return;
    }

    if (!this.signalingToken && this.wsSignalingAdapter.isConnected) {
      console.log(
        `${this.logPrefix}: Token removed while websocket connected, disconnecting signaling`
      );
      this.wsSignalingAdapter.disconnect();
      this.currentWsTargetId = undefined;
    }
  }

  private getSignalSenderId(message: SignalingMessage): string | undefined {
    return message.data.sender;
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

  /**
   * Sets up WebRTC adapter event listeners for signaling and data channel events.
   * @param webrtcAdapter - The WebrtcAdapter instance
   * @param peerId - The peer's unique identifier
   */
  setupWebrtcEvents(webrtcAdapter: WebrtcAdapter, peerId: string) {
    console.log("Setupwebrtc events");
    webrtcAdapter.on("onicecandidate", (candidate) => {
      try {
        this.sendSignalingMessage(peerId, {
          type: "ice-candidate",
          data: {
            ...this.buildSignalSenderData(peerId),
            candidate: candidate,
          },
        });
      } catch (error) {
        console.error(
          "[ConnectionService]: Error sending ice candidate:",
          error
        );
      }
    });

    webrtcAdapter.on("receivedMessage", async (message: WebrtcDataMessage) => {
      try {
        if (!this.chatService) {
          throw new Error(
            "Chat service not initialized. Please call setChatService before using chat features."
          );
        }
        // Type narrowing for WebrtcDataMessage
        switch (message.type) {
          case "chat":
            if (message.data) {
              await this.chatService.handleIncomingChatMessage(message.data);
            }
            break;
          case "ack":
            if (message.data) {
              console.log("Ack received");
              await this.chatService.handleAckMessage(message.data.messageId);
            }
            break;
        }
      } catch (error) {
        console.error(
          "[ConnectionService]: Error in WebRTC receivedMessage handler",
          error
        );
      }
    });

    webrtcAdapter.on("remoteStream", (stream) => {
      this.emit("remoteStream", stream);
    });

    webrtcAdapter.on("datachannel-open", () => {
      this.emit("peer-reconnected", peerId);
    });

    webrtcAdapter.on("connection-closed", () => {
      this.evictWebrtcAdapter(peerId);
    });

    webrtcAdapter.on("connection-failed", () => {
      this.evictWebrtcAdapter(peerId);
    });
  }

  /**
   * Removes a WebRTC adapter from the map and cleans it up. Listeners are
   * removed first to prevent re-entrant events during cleanup.
   */
  private evictWebrtcAdapter(peerId: string): void {
    const adapter = this.webrtcAdapters.get(peerId);
    if (!adapter) return;
    this.webrtcAdapters.delete(peerId);
    adapter.removeAllListeners();
    adapter.cleanup();
    console.log(`${this.logPrefix}: Evicted WebRTC adapter for peer ${peerId}`);
  }

  /**
   * Retrieves or creates a TcpClientAdapter for the given peer.
   * @param peerId - Unique identifier of the peer
   * @returns TcpClientAdapter instance
   */
  getTcpClientAdapter(peerId: string) {
    try {
      let adapter = this.tcpClientAdapters.get(peerId);
      if (!adapter) {
        adapter = new TcpClientAdapter(peerId);
        this.tcpClientAdapters.set(peerId, adapter);
        console.log("[ConnectionService] Created tcp client adapter");
      }
      return adapter;
    } catch (error) {
      console.error(
        `[ConnectionService]: Error getting tcp client adapter\n${JSON.stringify(
          { peerId },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Retrieves or creates a WebrtcAdapter for the given peer and sets up event listeners.
   * @param peerId - Unique identifier of the peer
   * @returns WebrtcAdapter instance
   */
  getWebrtcAdapter(peerId: string) {
    try {
      let adapter = this.webrtcAdapters.get(peerId);
      if (!adapter) {
        adapter = new WebrtcAdapter(peerId);
        this.setupWebrtcEvents(adapter, peerId);
        this.webrtcAdapters.set(peerId, adapter);
        console.log("[ConnectionService] Created webrtc adater");
      }
      return adapter;
    } catch (error) {
      console.error(
        `[ConnectionService]: Error getting webrtc adapter\n${JSON.stringify(
          { peerId },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Sets the chat service instance for handling chat-related events.
   * @param chatService - Instance of ChatService
   */
  setChatService(chatService: ChatService) {
    this.chatService = chatService;
  }

  /**
   * Starts the TCP server and initializes connections.
   * Throws error if startup fails.
   */
  start() {
    try {
      if (this.isTcpAllowed()) {
        this.tcpServerAdapter.start(this.networkConfig.port);
      }
      if (this.isWebSocketAllowed()) {
        this.ensureWsSignaling();
      }
      // await this.webrtcAdapter.initializeLocalStream();
    } catch (error) {
      console.error("[ConnectionService]: Error starting connection:", error);
      throw error;
    }
  }

  /**
   * Initiates connection to a peer using TCP and WebRTC.
   * Handles timeouts and connection events.
   * @param peerId - Unique identifier of the peer
   * @param ipAddress - IP address of the peer
   * @param port - Port number for TCP connection
   * @returns Promise that resolves when connection is established
   */
  async connectToPeer(peerId: string, ipAddress?: string, port?: number) {
    console.log(`${this.logPrefix}: connectToPeer started`, {
      peerId,
      ipAddress,
      port,
    });
    const tcpAdapter = this.getTcpClientAdapter(peerId);
    const webrtcAdapter = this.getWebrtcAdapter(peerId);
    const effectiveMode = this.appModeStore.getEffectiveMode(
      this.userStore.isGuest
    );
    const canUseWebsocket = this.isWebSocketAllowed();
    const canUseTcp = this.isTcpAllowed();
    const isWsConfigured = canUseWebsocket ? this.ensureWsSignaling() : false;
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
        {
          peerId,
        }
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
              "[ConnectionService]: TCP connect failed; no websocket available",
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
              data: {
                // port: this.networkConfig.port,
                // ipAddress: this.networkConfig.ipAddress,
                ...this.buildSignalSenderData(peerId),
              },
            });
          }

          this.sendSignalingMessage(peerId, {
            type: type,
            data: {
              sdp: { type, sdp },
              ...this.buildSignalSenderData(peerId),
            },
          });
        })
        .catch((error) => {
          console.warn(
            `[ConnectionService]: Error connecting to peer\n${JSON.stringify(
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

  // This method will assume that tcp and webrtc connection is good
  /**
   * Renegotiates the WebRTC connection with the specified peer.
   * @param peerId - Unique identifier of the peer
   */
  async renegotiate(peerId: string) {
    try {
      console.log(`${this.logPrefix}: Renegotiation requested`, {
        peerId,
      });
      const tcpAdapter = this.getTcpClientAdapter(peerId);
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      const isWsConfigured = this.ensureWsSignaling();

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
      this.sendSignalingMessage(peerId, {
        type: type,
        data: {
          sdp: { type, sdp },
          ...this.buildSignalSenderData(peerId),
        },
      });
    } catch (error) {
      console.error(
        `[ConnectionService]: Error renegotiating\n${JSON.stringify(
          { peerId },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  // This message is received from tcp client
  /**
   * Handles incoming WebRTC signaling messages received via TCP.
   * Processes ICE candidates, offers, answers, and handshake messages to coordinate
   * the WebRTC connection setup and negotiation between peers.
   * @param message - The signaling message containing type and data for connection negotiation
   */
  private async handleWebrtcConnection(message: SignalingMessage) {
    try {
      if (message.data.to !== this.userStore.user.id) {
        console.log(
          `${this.logPrefix}: Ignoring signaling not addressed to self`,
          {
            expectedRecipient: this.userStore.user.id,
            actualRecipient: message.data.to,
            messageType: message.type,
          }
        );
        return;
      }

      const senderId = this.getSignalSenderId(message);
      if (!senderId) {
        throw new Error("Invalid signaling payload: missing sender");
      }

      console.log(`${this.logPrefix}: Handling signaling message`, {
        ...this.summarizeSignalingMessage(message),
        resolvedSenderId: senderId,
      });

      let webrtcAdapter = this.getWebrtcAdapter(senderId);
      let tcpClientAdapter: TcpClientAdapter;
      switch (message.type) {
        case "ice-candidate":
          if (webrtcAdapter.isConnected) {
            console.log(
              `${this.logPrefix}: Ignoring ICE candidate because WebRTC is already connected`,
              { senderId }
            );
            return;
          }

          console.log("[ConnectionService]: Handling ice candidate message...");
          if (message.data.candidate !== null) {
            console.log(`${this.logPrefix}: Applying remote ICE candidate`, {
              senderId,
            });
            webrtcAdapter.addIceCandidate(message.data.candidate);
          }
          break;
        case "offer": {
          console.log("[ConnectionService]: Handling offer message...");
          const { type, sdp } = await webrtcAdapter.handleOffer({
            type: "offer",
            sdp: message.data.sdp.sdp || "",
          });
          this.sendSignalingMessage(senderId, {
            type: type,
            data: {
              sdp: { type, sdp },
              ...this.buildSignalSenderData(senderId),
            },
          });
          console.log(`${this.logPrefix}: Sent answer to offer`, {
            senderId,
            type,
          });
          break;
        }
        case "answer":
          console.log("[ConnectionService]: Handling answer message...");

          await webrtcAdapter.handleAnswer({
            type: "answer",
            sdp: message.data.sdp.sdp || "",
          });
          break;
        case "handshake":
          console.log("[ConnectionService]: Handling handshake message...");
          // console.log(message);
          if (webrtcAdapter.isConnected) {
            console.log(
              `${this.logPrefix}: Ignoring handshake because WebRTC is already connected`,
              { senderId }
            );
            return;
          }

          tcpClientAdapter = this.getTcpClientAdapter(senderId);
          if (tcpClientAdapter.isConnected) {
            console.log(
              `${this.logPrefix}: Ignoring handshake because TCP adapter is already connected`,
              { senderId }
            );
            return;
          }

          console.log(
            `${this.logPrefix}: Connecting TCP client from handshake`,
            {
              senderId,
              ipAddress: message.data.ipAddress,
              port: message.data.port,
            }
          );
          await tcpClientAdapter.connect(
            message.data.ipAddress,
            message.data.port
          );
          break;
        default:
          console.log("default");
          break;
      }
    } catch (error) {
      console.warn(
        `[ConnectionService]: Error handling webrtc connection\n${JSON.stringify(
          message,
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Resolves when the WebRTC data channel for the given peer is open.
   * Resolves immediately if already connected. Rejects after timeoutMs if the
   * channel never opens.
   */
  waitForDataChannel(peerId: string, timeoutMs = 5000): Promise<void> {
    const adapter = this.getWebrtcAdapter(peerId);
    if (adapter.isConnected) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`waitForDataChannel: timeout for peer ${peerId}`));
      }, timeoutMs);
      adapter.once("datachannel-open", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  // TODO: Probably this method can insert the id of the sender/current user
  /**
   * Sends a message to the specified peer.
   * @param peerId - Unique identifier of the peer
   * @param message - Message to send
   */
  sendMessage(peerId: string, message: Message) {
    try {
      if (!this.isTcpAllowed()) {
        console.warn(`${this.logPrefix}: TCP message blocked (mode disabled)`, {
          peerId,
          type: message.type,
        });
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
        `${this.logPrefix}: TCP adapter is not connected, message not sent`,
        {
          peerId,
          type: message.type,
        }
      );
    } catch (error) {
      console.error(
        `[ConnectionService]: Error sending message\n${JSON.stringify(
          { peerId, ...message },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  sendCallMessage(peerId: string, message: CallMessage) {
    try {
      const isWsConfigured = this.isWebSocketAllowed()
        ? this.ensureWsSignaling()
        : false;
      const isTcpAllowed = this.isTcpAllowed();

      if (isWsConfigured) {
        this.wsSignalingAdapter.sendMessage(message);
        return;
      }

      if (!isTcpAllowed) {
        throw new Error("No signaling transport available for this mode");
      }

      this.sendMessage(peerId, message);
    } catch (error) {
      console.error(
        `[ConnectionService]: Error sending call message\n${JSON.stringify(
          { peerId, ...message },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  private sendSignalingMessage(peerId: string, message: SignalingMessage) {
    try {
      const isWsConfigured = this.isWebSocketAllowed()
        ? this.ensureWsSignaling()
        : false;
      const isTcpAllowed = this.isTcpAllowed();

      console.log(`${this.logPrefix}: Routing signaling message`, {
        peerId,
        ...this.summarizeSignalingMessage(message),
        route: isWsConfigured ? "ws" : isTcpAllowed ? "tcp" : "none",
      });

      if (isWsConfigured) {
        this.wsSignalingAdapter.sendMessage(message);
        return;
      }

      if (!isTcpAllowed) {
        throw new Error("No signaling transport available for this mode");
      }

      this.sendMessage(peerId, message);
    } catch (error) {
      console.error(
        `[ConnectionService]: Error sending signaling message\n${JSON.stringify(
          { peerId, ...message },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  private ensureWsSignaling(): boolean {
    try {
      if (!this.isWebSocketAllowed()) {
        return false;
      }
      if (!this.signalingToken) {
        return false;
      }

      if (this.wsSignalingAdapter.isConnected) {
        console.log(
          `${this.logPrefix}: Reusing existing websocket signaling connection`
        );
        return true;
      }

      if (this.wsSignalingAdapter.isConnected) {
        this.wsSignalingAdapter.disconnect();
      }

      console.log(`${this.logPrefix}: Initializing websocket signaling`, {
        wsBaseUrl: this.wsBaseUrl,
        hasToken: Boolean(this.signalingToken),
      });

      this.wsSignalingAdapter.connect({
        baseUrl: this.wsBaseUrl,
        token: this.signalingToken,
      });

      return true;
    } catch (error) {
      console.warn(
        "[ConnectionService]: Could not initialize websocket signaling",
        error
      );
      this.currentWsTargetId = undefined;
      return false;
    }
  }

  // TODO: Make tcp as fallback once webrtc failed
  /**
   * Sends a chat message to the specified peer via WebRTC.
   * @param peerId - Unique identifier of the peer
   * @param messageData - DataChatMessageI containing chat message details
   */
  sendChatMessage(peerId: string, messageData: DataChatMessageI) {
    const {
      message,
      conversationId,
      messageId,
      from,
      sentAt,
      messageType,
      to,
    } = messageData;
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);

      webrtcAdapter.sendDataMessage({
        type: "chat",
        data: {
          message: message,
          conversationId: conversationId,
          messageId: messageId,
          from: from,
          to: to,
          sentAt: sentAt,
          messageType: messageType,
        },
      });
    } catch (error) {
      console.warn(
        `[ConnectionService]: Error sending chat message\n${JSON.stringify(
          {
            peerId,
            message,
            conversationId,
            messageId,
            from,
            sentAt,
            messageType,
          },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  // TODO: make tcp as fallback
  // ACK message will be used for the sender to know if the message is delivered or not
  /**
   * Sends an acknowledgement message to the specified peer.
   * @param peerId - Unique identifier of the peer
   * @param ackData - DataAckMessage containing messageId to acknowledge
   */
  sendAckMessage(peerId: string, ackData: DataAckMessage) {
    const { messageId } = ackData;
    try {
      console.log("sending ack message");

      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      webrtcAdapter.sendDataMessage({
        type: "ack",
        data: {
          messageId: messageId,
          from: this.userStore.user.id,
          to: peerId,
        },
      });
    } catch (error) {
      console.error(
        `[ConnectionService]: Error sending acknowledge message\n${JSON.stringify(
          {
            peerId,
            messageId,
          },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  async initializeStream(stream: "audio" | "video", peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Not connected");
      await webrtcAdapter.initializeLocalStream(true, stream === "video");
    } catch (error) {
      console.error(
        `[ConnectionService]: Error initializing the stream\n${JSON.stringify(
          {
            peerId,
          },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Terminates the call connection with the specified peer.
   * @param peerId - Unique identifier of the peer
   */
  terminateCallConnection(peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) return;
      webrtcAdapter.terminateCall();
    } catch (error) {
      console.error(
        `[ConnectionService]: Error terminating call connection\n${JSON.stringify(
          {
            peerId,
          },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Toggles the microphone state for the specified peer's connection.
   * @param peerId - Unique identifier of the peer
   */
  toggleMic(peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      webrtcAdapter.toggleMic();
    } catch (error) {
      console.error(
        `[ConnectionService]: Error toggling mic\n${JSON.stringify(
          {
            peerId,
          },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Toggles the camera state for the specified peer's connection.
   * @param peerId - Unique identifier of the peer
   */
  toggleCamera(peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      webrtcAdapter.toggleCamera();
    } catch (error) {
      console.error(
        `[ConnectionService]: Error toggling camera\n${JSON.stringify(
          {
            peerId,
          },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Retrieves the local media stream for the specified peer.
   * @param peerId - Unique identifier of the peer
   * @returns MediaStream instance
   */
  getLocalStream(peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      return webrtcAdapter.getLocalStream();
    } catch (error) {
      console.error(
        `[ConnectionService]: Error getting local stream\n${JSON.stringify(
          {
            peerId,
          },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Stops all connections, cleans up resources, and removes event listeners.
   * Should be called when the service is no longer needed.
   */
  stop() {
    try {
      console.log(`${this.logPrefix}: Stopping connection service`, {
        webrtcAdapters: this.webrtcAdapters.size,
        tcpClientAdapters: this.tcpClientAdapters.size,
      });
      this.webrtcAdapters.forEach((webrtc) => webrtc.cleanup());
      this.tcpClientAdapters.forEach((client) => client.disconnect());
      this.tcpServerAdapter.stop();
      this.wsSignalingAdapter.disconnect();
      this.currentWsTargetId = undefined;
      this.removeAllListeners();
      this.webrtcAdapters.forEach((adapter) => adapter.removeAllListeners());
    } catch (error) {
      console.error("[ConnectionService]: Error performing stop:", error);
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
        "[ConnectionService]: Error stopping TCP transport:",
        error
      );
      throw error;
    }
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
