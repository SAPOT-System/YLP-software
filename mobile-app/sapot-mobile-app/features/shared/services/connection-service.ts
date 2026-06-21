import { ChatService } from "@/features/chat/services/chat-service";
import { directConversationId } from "@/features/chat/utils/direct-conversation-id";
import { DataChatMessageI } from "@/features/chat/types";
import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";
import { MessageType } from "@/features/shared/database/model/Message";
import { connectionLog } from "@/features/shared/utils/logger";
import uuid from "react-native-uuid";
import { MediaStream } from "react-native-webrtc";
import {
  TcpClientAdapter,
  TcpServerAdapter,
  WsSignalingAdapter,
} from "../adapters";
import { WebrtcAdapter } from "../adapters/webrtc-adapter";
import { NotificationService } from "./notification-service";
import { AppModeStore, NetworkConfig, UserStore } from "../stores";
import {
  AckMessage,
  CallControlData,
  CallMessage,
  ChatMessage,
  DataAckMessage,
  Message,
  ServerAckMessage,
  SignalingMessage,
  SmsMessage,
} from "../types";
import { TypedEventEmitter } from "../utils/typed-event-emitter";
import { CallMediaService } from "./call-media-service";
import { CallMessageRouter, CallRouterResult } from "./call-message-router";
import { PeerKeyService } from "./peer-key-service";
import { PeerKeyStore } from "./peer-key-store";
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

export type CallEndedEventPayload = {
  peerId: string;
  callId?: string;
  status?: "completed" | "missed" | "rejected";
  endedAt?: number;
  durationSeconds?: number;
  initiatorId?: string;
  callType?: "audio" | "video";
  messageId?: string;
  conversationId?: string;
};

export type ConnectionServiceEvents = {
  "audio-call": [
    { peerId: string; callerName: string; conversationId?: string; callId?: string }
  ];
  "video-call": [
    { peerId: string; callerName: string; conversationId?: string; callId?: string }
  ];
  "call-ended": [payload: CallEndedEventPayload];
  "call-ready": [peerId: string];
  "call-busy": [
    peerId: string,
    payload: {
      callId: string;
      conversationId: string;
      messageId?: string;
      callType: "audio" | "video";
    }
  ];
  "camera-off": [peerId: string];
  "camera-on": [peerId: string];
  "switch-cam": [stream: MediaStream];
  "mic-off": [peerId: string];
  "mic-on": [peerId: string];
  remoteStream: [stream: MediaStream];
  "peer-reconnected": [peerId: string];
  "peer-disconnected": [peerId: string];
  "peer-rediscovered": [peerId: string];
  "call-reconnecting": [peerId: string];
  "connection-state": [payload: ConnectionStatePayload];
};

/**
 * ConnectionService is the facade over WebrtcSessionManager, SignalingService, and
 * CallMediaService. It owns TCP transport, WS adapter event wiring, and the
 * connectToPeer / renegotiate orchestration.
 */
export class ConnectionService extends TypedEventEmitter<ConnectionServiceEvents> {
  private tcpClientAdapters: Map<string, TcpClientAdapter> = new Map();
  private chatService?: ChatService;
  private callService?: { saveCallLogWithReceipts: (params: { peerId: string; content: string; status?: import("@/features/shared/database/model/MessageStatus").MessageStatusType; senderId: string; messageId?: string; conversationId?: string }) => Promise<string> };
  private peerService?: { updatePeerInfo: (id: string, info: { username?: string; firstName?: string; lastName?: string; isGuest?: boolean }) => Promise<void> };
  private activeCallPeerId: string | null = null;
  private glareAcceptedPeers: Set<string> = new Set();
  private callMessageRouter!: CallMessageRouter;

  constructor(
    private readonly tcpServerAdapter: TcpServerAdapter,
    private readonly networkConfig: NetworkConfig,
    private readonly userStore: UserStore,
    private readonly appModeStore: AppModeStore,
    private readonly wsSignalingAdapter: WsSignalingAdapter,
    private readonly webrtcSessionManager: WebrtcSessionManager,
    private readonly signalingService: SignalingService,
    private readonly callMediaService: CallMediaService,
    private readonly notificationService: NotificationService,
    private readonly peerKeyService?: PeerKeyService,
    private readonly peerKeyStore?: PeerKeyStore
  ) {
    super();

    this.callMessageRouter = new CallMessageRouter({
      isBusyFor: (peerId) => this.shouldBusyRejectIncomingCall(peerId),
      hasActiveCall: (peerId) => this.activeCallPeerId === peerId,
      notify: (data) => this.notificationService.showCallAlert(data),
    });

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
      void this.signalingService.sendSignalingMessage(peerId, msg)
    );

    // Forward WebrtcSessionManager events onto ConnectionService.
    this.webrtcSessionManager.on("remoteStream", (stream) => {
      this.emit("remoteStream", stream);
    });
    this.webrtcSessionManager.on("peer-reconnected", (peerId) => {
      this.emit("peer-reconnected", peerId);
    });
    this.webrtcSessionManager.setEvictionCallback((peerId, isRetry) => {
      this.emit("connection-state", {
        peerId,
        state: "failed",
        transport: "none",
        mode: this.appModeStore.getEffectiveMode(this.userStore.isGuest),
      });
      if (this.activeCallPeerId === peerId) {
        if (isRetry) {
          // Adapter evicted for a retry — show reconnecting UI instead of
          // terminating. peer-reconnected will fire once the new session's
          // datachannel opens.
          connectionLog.info("connection › peer evicted for retry during active call", { peerId });
          this.emit("call-reconnecting", peerId);
        } else {
          connectionLog.warn("connection › peer evicted during active call", { peerId });
          this.emit("peer-disconnected", peerId);
        }
      }
    });
    this.webrtcSessionManager.on("call-reconnecting", (peerId) => {
      this.emit("call-reconnecting", peerId);
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
    this.webrtcSessionManager.on("switch-cam", (stream) => {
      this.emit("switch-cam", stream);
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

    this.wsSignalingAdapter.on(
      "call-message",
      async (message: CallMessage) => {
        try {
          if (!this.isWebSocketAllowed()) return;
          const result = await this.callMessageRouter.handle(message);
          connectionLog.debug("connection › ws call message routed", { type: message.type, action: result.action });
          await this.dispatchCallResult(result);
        } catch (error) {
          connectionLog.error("connection › call message handling failed", {
            error,
          });
        }
      }
    );

    this.wsSignalingAdapter.on("ws-chat", async (message: ChatMessage) => {
      try {
        if (!this.isWebSocketAllowed()) return;
        if (!this.chatService) return;
        const raw = message.data as DataChatMessageI & { from_user?: string };
        const normalized: DataChatMessageI = raw.from
          ? raw
          : { ...raw, from: raw.from_user ?? "" };
        await this.chatService.handleIncomingChatMessage(normalized);
      } catch (error) {
        connectionLog.error("connection › ws chat handling failed", { error });
      }
    });

    this.wsSignalingAdapter.on("ws-sms", async (message: SmsMessage) => {
      try {
        if (!this.chatService) return;
        const { data } = message;
        await this.chatService.handleIncomingChatMessage({
          from: data.from,
          to: data.to,
          message: data.message,
          conversationId: data.conversationId,
          messageId: data.messageId,
          sentAt: new Date(data.sentAt),
          messageType: MessageType.SMS,
          senderProfile: data.senderProfile,
        });
      } catch (error) {
        connectionLog.error("connection › ws sms handling failed", { error });
      }
    });

    this.wsSignalingAdapter.on(
      "server-ack",
      async (message: ServerAckMessage) => {
        try {
          if (!this.isWebSocketAllowed()) return;
          if (!this.chatService) return;
          if (message.data.message_type !== "chat") return;
          await this.chatService.handleServerAck(message.data.messageId);
        } catch (error) {
          connectionLog.error("connection › server ack handling failed", {
            error,
          });
        }
      }
    );

    this.wsSignalingAdapter.on("ws-ack", async (message: AckMessage) => {
      try {
        if (!this.isWebSocketAllowed()) return;
        if (!this.chatService) return;
        await this.chatService.handleAckMessage(message.data.messageId);
      } catch (error) {
        connectionLog.error("connection › ws ack handling failed", { error });
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

    tcpServerAdapter.on("peer-identity", async ({ peerId, isGuest }: { peerId?: string; isGuest: boolean }) => {
      if (!peerId) return;
      try {
        await this.peerService?.updatePeerInfo(peerId, { isGuest });
      } catch (error) {
        connectionLog.error("connection › peer-identity update failed", { peerId, error });
      }
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
        if (message.type === "profile-info") {
          await this.peerService?.updatePeerInfo(message.data.from, {
            username: message.data.username,
            firstName: message.data.firstName,
            lastName: message.data.lastName,
          });
        }
        if (
          message.type === "audio-call" ||
          message.type === "video-call" ||
          message.type === "call-ended" ||
          message.type === "call-ready" ||
          message.type === "call-rejected"
        ) {
          const result = await this.callMessageRouter.handle(message);
          connectionLog.debug("connection › tcp call message routed", { type: message.type, action: result.action });
          await this.dispatchCallResult(result);
        }
      } catch (error) {
        connectionLog.error("connection › tcp handler failed", { error });
      }
    });
  }

  setActiveCall(peerId: string | null) {
    connectionLog.info("connection › active call updated", { peerId });
    if (peerId === null) {
      this.glareAcceptedPeers.clear();
    }
    this.activeCallPeerId = peerId;
  }

  shouldIgnoreCallBusy(peerId: string): boolean {
    return this.glareAcceptedPeers.has(peerId);
  }

  private async dispatchCallResult(result: CallRouterResult): Promise<void> {
    switch (result.action) {
      case "busy-reject":
        await this.handleBusyReject(result.peerId, result.callType, result.callId);
        break;
      case "glare":
        this.glareAcceptedPeers.add(result.peerId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.emit(result.eventName, result.eventPayload as any);
        break;
      case "emit":
        if (result.eventName === "call-busy") {
          const p = result.payload as { peerId: string; callId: string; conversationId: string; messageId?: string; callType: "audio" | "video" };
          this.emit("call-busy", p.peerId, { callId: p.callId, conversationId: p.conversationId, messageId: p.messageId, callType: p.callType });
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.emit(result.eventName, result.payload as any);
        }
        break;
      case "noop":
        break;
    }
  }

  private shouldBusyRejectIncomingCall(callerPeerId: string): boolean {
    if (this.activeCallPeerId === null) return false;
    if (this.activeCallPeerId !== callerPeerId) return true;

    // Deterministic glare resolution: one side accepts the incoming call,
    // the other side rejects it as busy.
    return this.userStore.user.id > callerPeerId;
  }

  private async handleBusyReject(
    callerPeerId: string,
    callType: "audio" | "video",
    callerCallId?: string
  ): Promise<void> {
    const callId = callerCallId ?? (uuid.v4() as string);
    const conversationId = directConversationId(
      this.userStore.user.id,
      callerPeerId
    );
    const content =
      callType === "audio" ? "Busy audio call" : "Busy video call";

    connectionLog.info("connection › busy reject start", {
      callerPeerId,
      callType,
      callId,
      callerCallIdProvided: Boolean(callerCallId),
      hasChatService: Boolean(this.chatService),
    });

    let messageId: string | undefined;

    if (this.callService && this.activeCallPeerId !== callerPeerId) {
      messageId = await this.callService.saveCallLogWithReceipts({
        peerId: callerPeerId,
        content,
        status: MessageStatusType.DELIVERED,
        senderId: callerPeerId,
        conversationId,
      });
      connectionLog.info("connection › busy reject call log saved", {
        callerPeerId,
        callType,
        callId,
        conversationId,
        messageId,
      });
    } else {
      connectionLog.warn(
        "connection › busy reject skipped call log — no callService",
        {
          callerPeerId,
          callType,
        }
      );
    }

    this.signalingService.sendCallMessage(callerPeerId, {
      type: "call-rejected",
      data: {
        from: this.userStore.user.id,
        to: callerPeerId,
        reason: "busy",
        callId,
        conversationId,
        messageId,
        callType,
      },
    });

    connectionLog.info("connection › busy reject sent", {
      callerPeerId,
      callType,
      callId,
      messageId,
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
    this.chatService = chatService;
    this.webrtcSessionManager.setChatService(chatService);
  }

  setCallService(callService: NonNullable<ConnectionService["callService"]>) {
    this.callService = callService;
  }

  setPeerService(peerService: { updatePeerInfo: (id: string, info: { username?: string; firstName?: string; lastName?: string; isGuest?: boolean }) => Promise<void> }) {
    this.peerService = peerService;
  }

  /**
   * Returns whether the peer is a guest based on the TCP handshake result.
   * Defaults to true (conservative) if no adapter exists or handshake not done.
   */
  getPeerIsGuest(peerId: string): boolean {
    return this.tcpClientAdapters.get(peerId)?.peerIsGuest ?? true;
  }

  /**
   * Retrieves or creates a TcpClientAdapter for the given peer.
   * Stays in ConnectionService per design constraint.
   */
  getTcpClientAdapter(peerId: string): TcpClientAdapter {
    try {
      let adapter = this.tcpClientAdapters.get(peerId);
      if (!adapter) {
        adapter = new TcpClientAdapter(peerId, this.peerKeyService, this.peerKeyStore, this.userStore.user.id);
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
   * Tears down and removes the cached TCP client adapter for a peer so the next
   * connect attempt builds a fresh one. Used when a peer's discovered address
   * changes (e.g. it restarted its TCP server on a new port) — the stale socket
   * may still report `isConnected` against the dead address otherwise.
   */
  evictTcpClientAdapter(peerId: string): void {
    const adapter = this.tcpClientAdapters.get(peerId);
    if (!adapter) return;
    try {
      adapter.disconnect();
    } catch (error) {
      connectionLog.warn("connection › tcp client evict disconnect failed", {
        peerId,
        error,
      });
    }
    this.tcpClientAdapters.delete(peerId);
    connectionLog.info("connection › tcp client evicted", { peerId });
  }

  /**
   * Called when a peer is re-discovered on the network with a new address.
   * Evicts the stale TCP adapter and notifies listeners so an open chat can
   * re-dial the peer at its new port/IP.
   */
  handlePeerRediscovered(peerId: string): void {
    this.evictTcpClientAdapter(peerId);
    this.emit("peer-rediscovered", peerId);
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
  async connectToPeer(
    peerId: string,
    ipAddress?: string,
    port?: number,
    addresses?: string[],
    _retryCount = 0
  ) {
    connectionLog.info("connection › connect start", {
      peerId,
      hasIpAddress: Boolean(ipAddress),
      hasPort: Boolean(port),
    });
    // Candidate dial list for a dual-homed peer (Wi-Fi + Ethernet): preferred
    // address first, then any other advertised addresses, de-duplicated.
    const candidateAddresses = Array.from(
      new Set([ipAddress, ...(addresses ?? [])].filter((a): a is string => Boolean(a)))
    );
    const tcpAdapter = this.getTcpClientAdapter(peerId);
    const webrtcAdapter = this.webrtcSessionManager.getWebrtcAdapter(peerId);
    webrtcAdapter.setIsPolite(this.userStore.user.id < peerId);
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
        if (candidateAddresses.length === 0 || !port) {
          throw new Error("TCP connection requires ipAddress and port");
        }
        await this.connectTcpWithRetry(tcpAdapter, candidateAddresses, port, 2);
        isTcpConnected = true;
        this.sendProfileInfo(peerId);
      }
    } else {
      if (canUseTcp && !isTcpConnected) {
        if (candidateAddresses.length > 0 && port) {
          try {
            await this.connectTcpWithRetry(tcpAdapter, candidateAddresses, port, 2);
            isTcpConnected = true;
            this.sendProfileInfo(peerId);
          } catch (error) {
            connectionLog.warn("connection › tcp connect failed after retries", {
              peerId,
              error,
            });
            if (!isWsConfigured) {
              throw error;
            }
            // WS is configured — fall through to WebRTC over WS
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
        if (_retryCount < 1 && signalingTransport !== "none") {
          connectionLog.info("connection › webrtc retry after failure", {
            peerId,
            transport: signalingTransport,
            _retryCount,
          });
          this.webrtcSessionManager.evictWebrtcAdapter(peerId, true);
          this.connectToPeer(peerId, ipAddress, port, addresses, _retryCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }
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
        if (_retryCount < 1 && signalingTransport !== "none") {
          connectionLog.info("connection › webrtc timeout retry", {
            peerId,
            transport: signalingTransport,
            _retryCount,
          });
          this.webrtcSessionManager.evictWebrtcAdapter(peerId, true);
          this.connectToPeer(peerId, ipAddress, port, addresses, _retryCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }
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
              data: {
                ...this.buildSignalSenderData(peerId),
                wsAllowed: this.appModeStore.isWebSocketAllowed(
                  this.userStore.isGuest
                ),
              },
            });
          }
          void this.signalingService.sendSignalingMessage(peerId, {
            type,
            data: {
              sdp: { type, sdp },
              ...this.buildSignalSenderData(peerId),
            },
          });
        })
        .catch((error) => {
          if (isSettled) return;
          isSettled = true;
          cleanup();
          connectionLog.warn("connection › connect failed", {
            peerId,
            hasIpAddress: Boolean(ipAddress),
            hasPort: Boolean(port),
            error,
          });
          // The createOffer failure typically means the peer connection is
          // wedged or dead (e.g. a stale "have-local-offer" PC left over from a
          // network blip on the other end). Discard it so the retry — and any
          // later reconnect — rebuilds a fresh PC instead of reusing the dead
          // one in a permanent failure loop.
          const willRetry = _retryCount < 1 && signalingTransport !== "none";
          this.webrtcSessionManager.evictWebrtcAdapter(peerId, willRetry);
          if (willRetry) {
            connectionLog.info("connection › retry after createOffer failure", {
              peerId,
              transport: signalingTransport,
              _retryCount,
            });
            this.connectToPeer(
              peerId,
              ipAddress,
              port,
              addresses,
              _retryCount + 1
            )
              .then(resolve)
              .catch(reject);
            return;
          }
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
      await this.signalingService.sendSignalingMessage(peerId, {
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

  sendChatMessage(
    peerId: string,
    messageData: DataChatMessageI
  ): "webrtc" | "ws" {
    let webrtcConnected = false;
    try {
      webrtcConnected = this.isWebrtcConnected(peerId);
    } catch {
      webrtcConnected = false;
    }

    if (webrtcConnected) {
      this.webrtcSessionManager.sendChatMessage(peerId, messageData);
      return "webrtc";
    }

    const effectiveMode = this.appModeStore.getEffectiveMode(
      this.userStore.isGuest
    );
    if (effectiveMode === "lan") {
      throw new Error("No data channel and WS not allowed in lan mode");
    }

    connectionLog.debug("connection › chat ws fallback", {
      peerId,
      messageId: messageData.messageId,
      mode: effectiveMode,
    });
    this.signalingService.sendChatMessage(peerId, messageData);
    return "ws";
  }

  sendAckMessage(peerId: string, ackData: DataAckMessage) {
    let webrtcConnected = false;
    try {
      webrtcConnected = this.isWebrtcConnected(peerId);
    } catch {
      webrtcConnected = false;
    }

    if (webrtcConnected) {
      this.webrtcSessionManager.sendAckMessage(peerId, ackData);
      return;
    }

    const effectiveMode = this.appModeStore.getEffectiveMode(
      this.userStore.isGuest
    );
    if (effectiveMode === "lan") {
      throw new Error("No data channel and WS not allowed in lan mode");
    }

    connectionLog.debug("connection › ack ws fallback", {
      peerId,
      messageId: ackData.messageId,
      mode: effectiveMode,
    });
    this.signalingService.sendAckMessage(peerId, ackData);
  }

  sendSeenMessage(peerId: string, conversationId: string) {
    this.webrtcSessionManager.sendSeenMessage(peerId, {
      conversationId,
      from: this.userStore.user.id,
      to: peerId,
    });
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

  async dismissIncomingCallNotification() {
    await this.notificationService.dismissCallAlert();
  }

  async initializeStreamEarly(stream: "audio" | "video", peerId: string) {
    return this.callMediaService.initializeStreamEarly(stream, peerId);
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

  async toggleCamera(peerId: string) {
    const res = await this.callMediaService.toggleCamera(peerId);
    this.sendCallControlMessage(peerId, "camera_toggle", {
      from: this.userStore.user.id,
      enabled: res,
    });
    return res;
  }

  async switchCamera(peerId: string, isFrontCamera: boolean) {
    await this.callMediaService.switchCamera(peerId, isFrontCamera);
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

  isWebsocketConnected() {
    return this.wsSignalingAdapter.isConnected;
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private sendProfileInfo(peerId: string) {
    try {
      const user = this.userStore.user;
      this.sendMessage(peerId, {
        type: "profile-info",
        data: {
          from: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });
    } catch (error) {
      connectionLog.warn("connection › profile-info send failed", { peerId, error });
    }
  }

  private async connectTcpWithRetry(
    adapter: TcpClientAdapter,
    ips: string | string[],
    port: number,
    maxRetries: number
  ): Promise<void> {
    const candidates = (Array.isArray(ips) ? ips : [ips]).filter(Boolean);
    if (candidates.length === 0) {
      throw new Error("No candidate addresses to connect");
    }
    let lastError: unknown;
    // Iterate addresses (e.g. a dual-homed peer's Wi-Fi + Ethernet IPs); each
    // address gets its own retry budget before falling through to the next.
    for (const ip of candidates) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          const delayMs = 500 * attempt;
          connectionLog.info("connection › tcp retry", {
            attempt,
            maxRetries,
            delayMs,
            ip,
            port,
          });
          await this.sleep(delayMs);
        }
        try {
          await adapter.connect(ip, port);
          return;
        } catch (error) {
          connectionLog.warn("connection › tcp attempt failed", {
            attempt,
            maxRetries,
            ip,
            error,
          });
          lastError = error;
        }
      }
    }
    throw lastError;
  }

  /**
   * Lightweight liveness probe: opens a bare TCP connection to ip:port (no
   * handshake) and resolves true on connect, false on error/timeout. Used by the
   * discovery liveness sweep to detect peers that vanished without an mDNS
   * "goodbye" packet.
   */
  probePeerReachable(ip: string, port: number, timeoutMs = 3000): Promise<boolean> {
    return TcpClientAdapter.probe(ip, port, timeoutMs);
  }

  private isTcpAllowed(): boolean {
    return this.appModeStore.isTcpAllowed(this.userStore.isGuest);
  }

  isWebSocketAllowed(): boolean {
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
