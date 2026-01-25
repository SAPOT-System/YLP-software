import type { DataChatMessageI } from "@/features/chat/types";

/**
 * For establishing webrtc connection
 */
export type SignalingMessage =
  | { type: "ice-candidate"; data: { senderId: string; candidate: any } }
  | { type: "offer"; data: { senderId: string; sdp: any } }
  | { type: "answer"; data: { senderId: string; sdp: any } }
  | {
      type: "handshake";
      data: { senderId: string; ipAddress: string; port: number };
    };

export type ChatMessage = { type: "chat"; data: DataChatMessageI };
export type DataAckMessage = { messageId: string };
export type AckMessage = { type: "ack"; data: DataAckMessage };

export type AudioCallMessage = {
  type: "audio-call";
  data: { senderId: string };
};
export type CallEndedMessage = {
  type: "call-ended";
  data: { senderId: string };
};

/**
 * For sent and received message via webrtc
 */
export type WebrtcDataMessage = ChatMessage | AckMessage;

/**
 * For sent and received message via tcp
 */
export type TcpDataMessage =
  | SignalingMessage
  | AudioCallMessage
  | CallEndedMessage;

export interface Peer {
  id: string;
  username: string;
  port: number;
  ipAddress: string;
  serviceName?: string;
  online?: boolean;
}

export interface DiscoveredService {
  serviceName: string;
  id: string;
  port: number;
  ipAddress: string;
}
