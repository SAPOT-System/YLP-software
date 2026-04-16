import { ChatService } from "@/features/chat/services/chat-service";
import { DataChatMessageI } from "@/features/chat/types";
import { webrtcLog } from "@/features/shared/utils/logger";
import { MediaStream } from "react-native-webrtc";
import { WebrtcAdapter } from "../adapters/webrtc-adapter";
import { NetworkConfig, UserStore } from "../stores";
import {
  CallControlData,
  DataAckMessage,
  SignalingMessage,
  WebrtcDataMessage,
} from "../types";
import { TypedEventEmitter } from "../utils/typed-event-emitter";

webrtcLog.debug("[webrtc-session-manager] module loaded");

type WebrtcSessionManagerEvents = {
  remoteStream: [stream: MediaStream];
  "peer-reconnected": [peerId: string];
  "camera-off": [peerId: string];
  "camera-on": [peerId: string];
  "switch-cam": [stream: MediaStream];
  "mic-off": [peerId: string];
  "mic-on": [peerId: string];
};

export class WebrtcSessionManager extends TypedEventEmitter<WebrtcSessionManagerEvents> {
  private webrtcAdapters: Map<string, WebrtcAdapter> = new Map();
  private chatService?: ChatService;
  private sendSignaling?: (peerId: string, msg: SignalingMessage) => void;

  constructor(
    private readonly userStore: UserStore,
    private readonly networkConfig: NetworkConfig
  ) {
    super();
    webrtcLog.info("webrtc › session manager constructed", {
      hasUserStore: Boolean(userStore),
      hasNetworkConfig: Boolean(networkConfig),
    });
  }

  setSignalingSender(fn: (peerId: string, msg: SignalingMessage) => void) {
    this.sendSignaling = fn;
  }

  setChatService(chatService: ChatService) {
    this.chatService = chatService;
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

  setupWebrtcEvents(webrtcAdapter: WebrtcAdapter, peerId: string) {
    webrtcLog.debug("webrtc › setup events", { peerId });

    webrtcAdapter.on("onicecandidate", (candidate) => {
      try {
        if (!this.sendSignaling)
          throw new Error("Signaling sender not configured");
        this.sendSignaling(peerId, {
          type: "ice-candidate",
          data: {
            ...this.buildSignalSenderData(peerId),
            candidate,
          },
        });
      } catch (error) {
        webrtcLog.error("webrtc › ice candidate send failed", {
          peerId,
          error,
        });
      }
    });

    webrtcAdapter.on("receivedMessage", async (message: WebrtcDataMessage) => {
      try {
        if (!this.chatService) {
          throw new Error(
            "Chat service not initialized. Call setChatService before using chat features."
          );
        }
        switch (message.type) {
          case "chat":
            if (message.data) {
              await this.chatService.handleIncomingChatMessage(message.data);
            }
            break;
          case "ack":
            if (message.data) {
              webrtcLog.debug("webrtc › ack received", {
                messageId: message.data.messageId,
              });
              await this.chatService.handleAckMessage(message.data.messageId);
            }
            break;
          case "camera_toggle":
            if (message.data) {
              webrtcLog.debug("webrtc › call control camera received", {
                messageId: message.data,
              });
              if (message.data.enabled) {
                this.emit("camera-on", message.data.from);
              } else {
                this.emit("camera-off", message.data.from);
              }
            }
            break;
          case "mic_toggle":
            if (message.data) {
              webrtcLog.debug("webrtc › call control mic received", {
                messageId: message.data,
              });
              if (message.data.enabled) {
                this.emit("mic-on", message.data.from);
              } else {
                this.emit("mic-off", message.data.from);
              }
            }
            break;
        }
      } catch (error) {
        webrtcLog.error("webrtc › message handler failed", {
          peerId,
          error,
        });
      }
    });

    webrtcAdapter.on("switch-cam", (stream: MediaStream) =>
      this.emit("switch-cam", stream)
    );

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

    webrtcAdapter.on(
      "signal-offer",
      (payload: {
        type: "offer";
        sdp: string | undefined;
        iceRestart?: boolean;
        reason?: string;
      }) => {
        try {
          if (!this.sendSignaling)
            throw new Error("Signaling sender not configured");
          this.sendSignaling(peerId, {
            type: payload.type,
            data: {
              sdp: { type: payload.type, sdp: payload.sdp! },
              iceRestart: payload.iceRestart,
              reason: payload.reason,
              ...this.buildSignalSenderData(peerId),
            },
          });
        } catch (error) {
          webrtcLog.error("webrtc › offer send failed", { peerId, error });
        }
      }
    );
  }

  evictWebrtcAdapter(peerId: string): void {
    const adapter = this.webrtcAdapters.get(peerId);
    if (!adapter) return;
    this.webrtcAdapters.delete(peerId);
    adapter.removeAllListeners();
    adapter.cleanup();
    webrtcLog.info("webrtc › adapter evicted", { peerId });
  }

  getWebrtcAdapter(peerId: string): WebrtcAdapter {
    try {
      let adapter = this.webrtcAdapters.get(peerId);
      if (!adapter) {
        adapter = new WebrtcAdapter(peerId);
        this.setupWebrtcEvents(adapter, peerId);
        this.webrtcAdapters.set(peerId, adapter);
        webrtcLog.info("webrtc › adapter created", { peerId });
      }
      return adapter;
    } catch (error) {
      webrtcLog.error("webrtc › adapter get failed", { peerId, error });
      throw error;
    }
  }

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
          message,
          conversationId,
          messageId,
          from,
          to,
          sentAt,
          messageType,
        },
      });
    } catch (error) {
      webrtcLog.warn("webrtc › chat send failed", {
        peerId,
        conversationId,
        messageId,
        messageType,
        hasMessage: Boolean(message),
        error,
      });
      throw error;
    }
  }

  sendAckMessage(peerId: string, ackData: DataAckMessage) {
    const { messageId } = ackData;
    try {
      webrtcLog.debug("webrtc › ack send", { peerId, messageId });
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      webrtcAdapter.sendDataMessage({
        type: "ack",
        data: {
          messageId,
          from: this.userStore.user.id,
          to: peerId,
        },
      });
    } catch (error) {
      webrtcLog.error("webrtc › ack send failed", {
        peerId,
        messageId,
        error,
      });
      throw error;
    }
  }

  sendCallControlMessage(
    peerId: string,
    type: "camera_toggle" | "mic_toggle",
    { enabled, from }: CallControlData
  ) {
    try {
      webrtcLog.debug("webrtc › call control send", { peerId, type, enabled });
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      webrtcAdapter.sendDataMessage({
        type: type,
        data: {
          from: from,
          enabled: enabled,
        },
      });
    } catch (error) {
      webrtcLog.error("webrtc › call control send failed", {
        peerId,
        enabled,
        error,
      });
      throw error;
    }
  }

  cleanupAll() {
    this.webrtcAdapters.forEach((adapter) => {
      adapter.removeAllListeners();
      adapter.cleanup();
    });
    this.webrtcAdapters.clear();
  }
}
