import { getWsUrl } from "@/config/runtime";
import { signalingLog } from "@/features/shared/utils/logger";
import {
    TcpClientAdapter,
    WsSignalingAdapter,
} from "../adapters";
import { WebrtcAdapter } from "../adapters/webrtc-adapter";
import { AppModeStore, NetworkConfig, UserStore } from "../stores";
import type { DataChatMessageI } from "@/features/chat/types";
import { AckMessage, CallMessage, ChatMessage, DataAckMessage, Message, SignalingMessage } from "../types";

signalingLog.debug("[signaling-service] module loaded");

export class SignalingService {
  private signalingToken?: string;
  private getTcpAdapter?: (peerId: string) => TcpClientAdapter | undefined;
  private sendTcpMessage?: (peerId: string, message: Message) => void;
  private readonly peerForceTcp = new Set<string>();

  constructor(
    private readonly getWebrtcAdapter: (peerId: string) => WebrtcAdapter,
    private readonly wsSignalingAdapter: WsSignalingAdapter,
    private readonly wsBaseUrl: string = getWsUrl(),
    private readonly userStore: UserStore,
    private readonly networkConfig: NetworkConfig,
    private readonly appModeStore: AppModeStore
  ) {
    signalingLog.info("signaling › service constructed", {
      hasWebrtcAdapter: Boolean(getWebrtcAdapter),
      hasWsSignalingAdapter: Boolean(wsSignalingAdapter),
      hasWsBaseUrl: Boolean(wsBaseUrl),
      hasUserStore: Boolean(userStore),
      hasNetworkConfig: Boolean(networkConfig),
      hasAppModeStore: Boolean(appModeStore),
    });
  }

  setTcpCallbacks(
    getTcpAdapter: (peerId: string) => TcpClientAdapter | undefined,
    sendTcpMessage: (peerId: string, message: Message) => void
  ) {
    this.getTcpAdapter = getTcpAdapter;
    this.sendTcpMessage = sendTcpMessage;
  }

  setSignalingToken(token?: string) {
    this.signalingToken = token || undefined;
    signalingLog.debug("signaling › token updated", {
      hasToken: Boolean(this.signalingToken),
    });

    if (!this.isWebSocketAllowed() && this.wsSignalingAdapter.isConnected) {
      signalingLog.info("signaling › ws disconnect", { reason: "mode" });
      this.wsSignalingAdapter.disconnect();
      return;
    }

    if (!this.signalingToken && this.wsSignalingAdapter.isConnected) {
      signalingLog.info("signaling › ws disconnect", { reason: "token" });
      this.wsSignalingAdapter.disconnect();
    }
  }

  ensureWsSignaling(): boolean {
    try {
      if (!this.isWebSocketAllowed()) return false;
      if (!this.signalingToken) return false;

      if (this.wsSignalingAdapter.isConnected) {
        signalingLog.debug("signaling › ws reuse");
        return true;
      }

      signalingLog.debug("signaling › ws init", {
        hasToken: Boolean(this.signalingToken),
      });

      this.wsSignalingAdapter.connect({
        baseUrl: this.wsBaseUrl,
        token: this.signalingToken,
      });

      return true;
    } catch (error) {
      signalingLog.warn("signaling › ws init failed", { error });
      return false;
    }
  }

  async handleIncomingSignaling(message: SignalingMessage): Promise<void> {
    try {
      if (message.data.to !== this.userStore.user.id) {
        signalingLog.debug("signaling › message ignored", {
          expectedRecipient: this.userStore.user.id,
          actualRecipient: message.data.to,
          messageType: message.type,
        });
        return;
      }

      const senderId = this.getSignalSenderId(message);
      if (!senderId) {
        throw new Error("Invalid signaling payload: missing sender");
      }

      signalingLog.debug("signaling › message handling", {
        ...this.summarizeSignalingMessage(message),
        resolvedSenderId: senderId,
      });

      const webrtcAdapter = this.getWebrtcAdapter(senderId);

      switch (message.type) {
        case "ice-candidate":
          if (webrtcAdapter.isConnected) {
            signalingLog.debug("signaling › ice ignored", { senderId });
            return;
          }
          signalingLog.debug("signaling › ice apply", { senderId });
          if (message.data.candidate !== null) {
            webrtcAdapter.addIceCandidate(message.data.candidate);
          }
          break;

        case "offer": {
          signalingLog.debug("signaling › offer received", { senderId });
          const { type, sdp } = await webrtcAdapter.handleOffer({
            type: "offer",
            sdp: message.data.sdp.sdp || "",
          });
          this.sendSignalingMessage(senderId, {
            type,
            data: {
              sdp: { type, sdp },
              ...this.buildSignalSenderData(senderId),
            },
          });
          signalingLog.debug("signaling › offer answered", { senderId, type });
          break;
        }

        case "answer":
          signalingLog.debug("signaling › answer received", { senderId });
          await webrtcAdapter.handleAnswer({
            type: "answer",
            sdp: message.data.sdp.sdp || "",
          });
          break;

        case "handshake": {
          signalingLog.debug("signaling › handshake received", { senderId });
          if (webrtcAdapter.isConnected) {
            signalingLog.debug("signaling › handshake ignored", { senderId });
            return;
          }
          if (!this.getTcpAdapter) {
            throw new Error("getTcpAdapter not configured on SignalingService");
          }
          const tcpClientAdapter = this.getTcpAdapter(senderId);
          if (!tcpClientAdapter) {
            throw new Error(`No TCP adapter available for peer ${senderId}`);
          }
          if (tcpClientAdapter.isConnected) {
            signalingLog.debug("signaling › handshake ignored", {
              senderId,
              reason: "tcp connected",
            });
            return;
          }
          signalingLog.info("signaling › tcp connect from handshake", {
            senderId,
            hasIpAddress: Boolean(message.data.ipAddress),
            hasPort: Boolean(message.data.port),
          });
          await tcpClientAdapter.connect(
            message.data.ipAddress,
            message.data.port
          );
          if (message.data.wsAllowed === false) {
            this.peerForceTcp.add(senderId);
          }
          break;
        }

        default:
          signalingLog.debug("signaling › unhandled type");
          break;
      }
    } catch (error) {
      signalingLog.warn("signaling › message handling failed", {
        messageType: message.type,
        sender: message.data.sender,
        error,
      });
      throw error;
    }
  }

  sendSignalingMessage(peerId: string, message: SignalingMessage) {
    try {
      const isWsConfigured = this.isWebSocketAllowed()
        ? this.ensureWsSignaling()
        : false;
      const isTcpAllowed = this.isTcpAllowed();
      const isTcpConnectedForPeer =
        this.getTcpAdapter?.(peerId)?.isConnected ?? false;
      const shouldUseTcp =
        isTcpConnectedForPeer || this.peerForceTcp.has(peerId);

      signalingLog.debug("signaling › route", {
        peerId,
        messageType: message.type,
        route:
          isWsConfigured && !shouldUseTcp
            ? "ws"
            : isTcpAllowed
            ? "tcp"
            : "none",
        isTcpConnectedForPeer,
        peerForceTcp: this.peerForceTcp.has(peerId),
      });

      if (isWsConfigured && !shouldUseTcp) {
        this.wsSignalingAdapter.sendMessage(message);
        return;
      }

      if (!isTcpAllowed) {
        throw new Error("No signaling transport available for this mode");
      }

      if (!this.sendTcpMessage) {
        throw new Error("sendTcpMessage not configured on SignalingService");
      }
      this.sendTcpMessage(peerId, message);
    } catch (error) {
      signalingLog.error("signaling › send failed", {
        peerId,
        messageType: message.type,
        error,
      });
      throw error;
    }
  }

  sendChatMessage(peerId: string, messageData: DataChatMessageI): void {
    try {
      const isWsConfigured = this.isWebSocketAllowed()
        ? this.ensureWsSignaling()
        : false;

      if (!isWsConfigured || !this.wsSignalingAdapter.isConnected) {
        throw new Error("WebSocket unavailable for chat fallback");
      }

      const payload: ChatMessage = { type: "chat", data: messageData };

      signalingLog.debug("signaling › ws chat relay", {
        peerId,
        messageId: messageData.messageId,
      });
      this.wsSignalingAdapter.sendMessage(payload);
    } catch (error) {
      signalingLog.error("signaling › ws chat relay failed", {
        peerId,
        error,
      });
      throw error;
    }
  }

  sendAckMessage(peerId: string, ackData: DataAckMessage): void {
    try {
      const isWsConfigured = this.isWebSocketAllowed()
        ? this.ensureWsSignaling()
        : false;

      if (!isWsConfigured || !this.wsSignalingAdapter.isConnected) {
        throw new Error("WebSocket unavailable for ack fallback");
      }

      const payload: AckMessage = { type: "ack", data: ackData };

      signalingLog.debug("signaling › ws ack relay", {
        peerId,
        messageId: ackData.messageId,
      });
      this.wsSignalingAdapter.sendMessage(payload);
    } catch (error) {
      signalingLog.error("signaling › ws ack relay failed", { peerId, error });
      throw error;
    }
  }

  sendCallMessage(peerId: string, message: CallMessage) {
    try {
      const isWsConfigured = this.isWebSocketAllowed()
        ? this.ensureWsSignaling()
        : false;
      const isTcpAllowed = this.isTcpAllowed();
      const isTcpConnectedForPeer =
        this.getTcpAdapter?.(peerId)?.isConnected ?? false;
      const shouldUseTcp =
        isTcpConnectedForPeer || this.peerForceTcp.has(peerId);

      signalingLog.debug("signaling › call route", {
        peerId,
        messageType: message.type,
        route: isWsConfigured && !shouldUseTcp ? "ws" : isTcpAllowed ? "tcp" : "none",
        isTcpConnectedForPeer,
        peerForceTcp: this.peerForceTcp.has(peerId),
      });

      if (isWsConfigured && !shouldUseTcp) {
        this.wsSignalingAdapter.sendMessage(message);
        return;
      }

      if (!isTcpAllowed) {
        throw new Error("No signaling transport available for this mode");
      }

      if (!this.sendTcpMessage) {
        throw new Error("sendTcpMessage not configured on SignalingService");
      }
      this.sendTcpMessage(peerId, message);
    } catch (error) {
      signalingLog.error("signaling › call send failed", {
        peerId,
        messageType: message.type,
        error,
      });
      throw error;
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

  private summarizeSignalingMessage(message: SignalingMessage) {
    return {
      messageType: message.type,
      to: message.data.to,
      sender: message.data.sender,
    };
  }

  private isTcpAllowed(): boolean {
    return this.appModeStore.isTcpAllowed(this.userStore.isGuest);
  }

  private isWebSocketAllowed(): boolean {
    return this.appModeStore.isWebSocketAllowed(this.userStore.isGuest);
  }
}
