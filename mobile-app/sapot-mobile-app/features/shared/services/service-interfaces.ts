import { ChatService } from "@/features/chat/services/chat-service";
import { DataChatMessageI } from "@/features/chat/types";
import { MediaStream } from "react-native-webrtc";
import { TcpClientAdapter } from "../adapters";
import { WebrtcAdapter } from "../adapters/webrtc-adapter";
import { CallMessage, DataAckMessage, Message, SignalingMessage } from "../types";
import { serviceLog } from "../utils/logger";
serviceLog.debug("[service-interfaces] module loaded");

export interface IWebrtcSessionManager {
  getWebrtcAdapter(peerId: string): WebrtcAdapter;
  waitForDataChannel(peerId: string, timeoutMs?: number): Promise<void>;
  sendChatMessage(peerId: string, messageData: DataChatMessageI): void;
  sendAckMessage(peerId: string, ackData: DataAckMessage): void;
  setChatService(chatService: ChatService): void;
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
