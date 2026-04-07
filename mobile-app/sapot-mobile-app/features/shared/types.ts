/// <reference lib="dom" />
import type { DataChatMessageI } from "@/features/chat/types";
import { RTCSessionDescriptionInit } from "react-native-webrtc/lib/typescript/RTCSessionDescription";

/**
 * For establishing webrtc connection
 */
export type SignalingMessage =
  | {
      type: "ice-candidate";
      data: {
        to: string;
        candidate: RTCIceCandidate | null;
        sender: string;
        ipAddress: string;
        port: number;
      };
    }
  | {
      type: "offer";
      data: {
        to: string;
        sdp: RTCSessionDescriptionInit;
        sender: string;
        ipAddress: string;
        port: number;
      };
    }
  | {
      type: "answer";
      data: {
        to: string;
        sdp: RTCSessionDescriptionInit;
        sender: string;
        ipAddress: string;
        port: number;
      };
    }
  | {
      type: "handshake";
      data: {
        to: string;
        ipAddress: string;
        port: number;
        sender: string;
      };
    };

export type ChatMessage = { type: "chat"; data: DataChatMessageI };
export type DataAckMessage = { messageId: string; from: string; to: string };
export type AckMessage = { type: "ack"; data: DataAckMessage };

export type AudioCallMessage = {
  type: "audio-call";
  data: { from: string; to: string };
};
export type VideoCallMessage = {
  type: "video-call";
  data: { from: string; to: string };
};
export type CallEndedMessage = {
  type: "call-ended";
  data: { from: string; to: string };
};

/**
 * For sent and received message via webrtc
 */
export type WebrtcDataMessage = ChatMessage | AckMessage | CallMessage;

/**
 * For sent and received message via tcp
 */
export type Message = SignalingMessage | CallMessage;

export type CallMessage =
  | AudioCallMessage
  | CallEndedMessage
  | VideoCallMessage;

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
export interface PublishedService {
  type: string;
  protocol: string;
  domain: string;
  name: string;
  port: number;
  txt: { id: string; username: string };
}
