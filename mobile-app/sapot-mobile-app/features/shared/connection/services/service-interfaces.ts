import { DataChatMessageI } from "@/features/shared/core/messaging-types";
import { MediaStream } from "react-native-webrtc";
import { TcpClientAdapter } from "../adapters";
import { WebrtcAdapter } from "../adapters/webrtc-adapter";
import { Message as WatermelonMessage } from "../../core/database";
import { CallMessage, DataAckMessage, Message, SignalingMessage } from "../../types";
import { serviceLog } from "../../core/utils/logger";
serviceLog.debug("[service-interfaces] module loaded");

/** Minimal chat handler interface — the subset of ChatService the engine needs. */
export interface IChatMessageHandler {
  handleIncomingChatMessage(data: DataChatMessageI): Promise<void>;
  handleAckMessage(messageId: string): Promise<void>;
  handleSeenMessage(conversationId: string): Promise<void>;
  handleServerAck(messageId: string): Promise<void>;
}

/** Minimal chat interface for DiscoveryService — resend-queue operations. */
export interface IDiscoveryChatService {
  getAllNotSentMessageForPeer(peerId: string): Promise<WatermelonMessage[]>;
  tryResendMessage(
    msg: WatermelonMessage,
    peerId: string,
    options?: { ipAddress: string; port: number }
  ): Promise<void>;
}

export interface IWebrtcSessionManager {
  getWebrtcAdapter(peerId: string): WebrtcAdapter;
  waitForDataChannel(peerId: string, timeoutMs?: number): Promise<void>;
  sendChatMessage(peerId: string, messageData: DataChatMessageI): void;
  sendAckMessage(peerId: string, ackData: DataAckMessage): void;
  setChatService(chatService: IChatMessageHandler): void;
  setSignalingSender(fn: (peerId: string, msg: SignalingMessage) => void | Promise<void>): void;
  cleanupAll(): void;
  on(event: "remoteStream", listener: (stream: MediaStream) => void): this;
  on(event: "peer-reconnected", listener: (peerId: string) => void): this;
}

export interface ISignalingService {
  handleIncomingSignaling(message: SignalingMessage): Promise<void>;
  sendSignalingMessage(peerId: string, message: SignalingMessage): Promise<void>;
  sendCallMessage(peerId: string, message: CallMessage): void;
  setSignalingToken(token?: string): void;
  ensureWsSignaling(): boolean;
  setTcpCallbacks(
    getTcpAdapter: (peerId: string) => TcpClientAdapter | undefined,
    sendTcpMessage: (peerId: string, message: Message) => void
  ): void;
}

export interface ICallMediaService {
  initializeStream(stream: "audio" | "video", peerId: string): Promise<void>;
  terminateCallConnection(peerId: string): void;
  toggleMic(peerId: string): void;
  toggleCamera(peerId: string): void;
  getLocalStream(peerId: string): MediaStream;
}
