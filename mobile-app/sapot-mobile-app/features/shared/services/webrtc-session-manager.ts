import { ChatService } from "@/features/chat/services/chat-service";
import { DataChatMessageI } from "@/features/chat/types";
import { MediaStream } from "react-native-webrtc";
import { WebrtcAdapter } from "../adapters";
import { NetworkConfig, UserStore } from "../stores";
import { DataAckMessage, SignalingMessage, WebrtcDataMessage } from "../types";
import { TypedEventEmitter } from "../utils/typed-event-emitter";

type WebrtcSessionManagerEvents = {
  remoteStream: [stream: MediaStream];
  "peer-reconnected": [peerId: string];
};

export class WebrtcSessionManager extends TypedEventEmitter<WebrtcSessionManagerEvents> {
  private webrtcAdapters: Map<string, WebrtcAdapter> = new Map();
  private chatService?: ChatService;
  private sendSignaling?: (peerId: string, msg: SignalingMessage) => void;
  private readonly logPrefix = "[WebrtcSessionManager]";

  constructor(
    private readonly userStore: UserStore,
    private readonly networkConfig: NetworkConfig
  ) {
    super();
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
    console.log(`${this.logPrefix}: Setting up WebRTC events`, { peerId });

    webrtcAdapter.on("onicecandidate", (candidate) => {
      try {
        if (!this.sendSignaling) throw new Error("Signaling sender not configured");
        this.sendSignaling(peerId, {
          type: "ice-candidate",
          data: {
            ...this.buildSignalSenderData(peerId),
            candidate,
          },
        });
      } catch (error) {
        console.error(`${this.logPrefix}: Error sending ICE candidate`, error);
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
              console.log(`${this.logPrefix}: Ack received`);
              await this.chatService.handleAckMessage(message.data.messageId);
            }
            break;
        }
      } catch (error) {
        console.error(`${this.logPrefix}: Error in receivedMessage handler`, error);
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

    webrtcAdapter.on(
      "signal-offer",
      (payload: {
        type: "offer";
        sdp: string | undefined;
        iceRestart?: boolean;
        reason?: string;
      }) => {
        try {
          if (!this.sendSignaling) throw new Error("Signaling sender not configured");
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
          console.error(`${this.logPrefix}: Error sending signal-offer`, error);
        }
      }
    );
  }

  private evictWebrtcAdapter(peerId: string): void {
    const adapter = this.webrtcAdapters.get(peerId);
    if (!adapter) return;
    this.webrtcAdapters.delete(peerId);
    adapter.removeAllListeners();
    adapter.cleanup();
    console.log(`${this.logPrefix}: Evicted WebRTC adapter for peer`, { peerId });
  }

  getWebrtcAdapter(peerId: string): WebrtcAdapter {
    try {
      let adapter = this.webrtcAdapters.get(peerId);
      if (!adapter) {
        adapter = new WebrtcAdapter(peerId);
        this.setupWebrtcEvents(adapter, peerId);
        this.webrtcAdapters.set(peerId, adapter);
        console.log(`${this.logPrefix}: Created WebRTC adapter`, { peerId });
      }
      return adapter;
    } catch (error) {
      console.error(`${this.logPrefix}: Error getting WebRTC adapter`, { peerId }, error);
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
    const { message, conversationId, messageId, from, sentAt, messageType, to } = messageData;
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      webrtcAdapter.sendDataMessage({
        type: "chat",
        data: { message, conversationId, messageId, from, to, sentAt, messageType },
      });
    } catch (error) {
      console.warn(
        `${this.logPrefix}: Error sending chat message\n${JSON.stringify(
          { peerId, message, conversationId, messageId, from, sentAt, messageType },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  sendAckMessage(peerId: string, ackData: DataAckMessage) {
    const { messageId } = ackData;
    try {
      console.log(`${this.logPrefix}: Sending ack message`);
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
      console.error(
        `${this.logPrefix}: Error sending ack message\n${JSON.stringify(
          { peerId, messageId },
          null,
          2
        )}\n${error}`
      );
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
