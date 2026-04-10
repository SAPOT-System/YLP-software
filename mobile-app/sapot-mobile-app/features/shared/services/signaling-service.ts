import { getWsUrl } from "@/config/runtime";
import { TcpClientAdapter, WebrtcAdapter, WsSignalingAdapter } from "../adapters";
import { AppModeStore, NetworkConfig, UserStore } from "../stores";
import { CallMessage, Message, SignalingMessage } from "../types";

export class SignalingService {
  private signalingToken?: string;
  private getTcpAdapter?: (peerId: string) => TcpClientAdapter | undefined;
  private sendTcpMessage?: (peerId: string, message: Message) => void;
  private readonly logPrefix = "[SignalingService]";

  constructor(
    private readonly getWebrtcAdapter: (peerId: string) => WebrtcAdapter,
    private readonly wsSignalingAdapter: WsSignalingAdapter,
    private readonly wsBaseUrl: string = getWsUrl(),
    private readonly userStore: UserStore,
    private readonly networkConfig: NetworkConfig,
    private readonly appModeStore: AppModeStore
  ) {}

  setTcpCallbacks(
    getTcpAdapter: (peerId: string) => TcpClientAdapter | undefined,
    sendTcpMessage: (peerId: string, message: Message) => void
  ) {
    this.getTcpAdapter = getTcpAdapter;
    this.sendTcpMessage = sendTcpMessage;
  }

  setSignalingToken(token?: string) {
    this.signalingToken = token || undefined;
    console.log(`${this.logPrefix}: Updated signaling token`, {
      hasToken: Boolean(this.signalingToken),
    });

    if (!this.isWebSocketAllowed() && this.wsSignalingAdapter.isConnected) {
      console.log(`${this.logPrefix}: Websocket disabled by mode, disconnecting`);
      this.wsSignalingAdapter.disconnect();
      return;
    }

    if (!this.signalingToken && this.wsSignalingAdapter.isConnected) {
      console.log(`${this.logPrefix}: Token removed, disconnecting signaling`);
      this.wsSignalingAdapter.disconnect();
    }
  }

  ensureWsSignaling(): boolean {
    try {
      if (!this.isWebSocketAllowed()) return false;
      if (!this.signalingToken) return false;

      if (this.wsSignalingAdapter.isConnected) {
        console.log(`${this.logPrefix}: Reusing existing websocket signaling connection`);
        return true;
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
      console.warn(`${this.logPrefix}: Could not initialize websocket signaling`, error);
      return false;
    }
  }

  async handleIncomingSignaling(message: SignalingMessage): Promise<void> {
    try {
      if (message.data.to !== this.userStore.user.id) {
        console.log(`${this.logPrefix}: Ignoring signaling not addressed to self`, {
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

      console.log(`${this.logPrefix}: Handling signaling message`, {
        ...this.summarizeSignalingMessage(message),
        resolvedSenderId: senderId,
      });

      const webrtcAdapter = this.getWebrtcAdapter(senderId);

      switch (message.type) {
        case "ice-candidate":
          if (webrtcAdapter.isConnected) {
            console.log(`${this.logPrefix}: Ignoring ICE candidate, WebRTC already connected`, { senderId });
            return;
          }
          console.log(`${this.logPrefix}: Applying remote ICE candidate`, { senderId });
          if (message.data.candidate !== null) {
            webrtcAdapter.addIceCandidate(message.data.candidate);
          }
          break;

        case "offer": {
          console.log(`${this.logPrefix}: Handling offer message`);
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
          console.log(`${this.logPrefix}: Sent answer to offer`, { senderId, type });
          break;
        }

        case "answer":
          console.log(`${this.logPrefix}: Handling answer message`);
          await webrtcAdapter.handleAnswer({
            type: "answer",
            sdp: message.data.sdp.sdp || "",
          });
          break;

        case "handshake": {
          console.log(`${this.logPrefix}: Handling handshake message`);
          if (webrtcAdapter.isConnected) {
            console.log(`${this.logPrefix}: Ignoring handshake, WebRTC already connected`, { senderId });
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
            console.log(`${this.logPrefix}: Ignoring handshake, TCP already connected`, { senderId });
            return;
          }
          console.log(`${this.logPrefix}: Connecting TCP from handshake`, {
            senderId,
            ipAddress: message.data.ipAddress,
            port: message.data.port,
          });
          await tcpClientAdapter.connect(message.data.ipAddress, message.data.port);
          break;
        }

        default:
          console.log(`${this.logPrefix}: Unhandled signaling type`);
          break;
      }
    } catch (error) {
      console.warn(
        `${this.logPrefix}: Error handling signaling\n${JSON.stringify(message, null, 2)}\n${error}`
      );
      throw error;
    }
  }

  sendSignalingMessage(peerId: string, message: SignalingMessage) {
    try {
      const isWsConfigured = this.isWebSocketAllowed() ? this.ensureWsSignaling() : false;
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

      if (!this.sendTcpMessage) {
        throw new Error("sendTcpMessage not configured on SignalingService");
      }
      this.sendTcpMessage(peerId, message);
    } catch (error) {
      console.error(
        `${this.logPrefix}: Error sending signaling message\n${JSON.stringify(
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
      const isWsConfigured = this.isWebSocketAllowed() ? this.ensureWsSignaling() : false;
      const isTcpAllowed = this.isTcpAllowed();

      if (isWsConfigured) {
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
      console.error(
        `${this.logPrefix}: Error sending call message\n${JSON.stringify(
          { peerId, ...message },
          null,
          2
        )}\n${error}`
      );
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
