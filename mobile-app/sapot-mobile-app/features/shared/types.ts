/// <reference lib="dom" />
import type { DataChatMessageI } from "@/features/chat/types";
import { RTCSessionDescriptionInit } from "react-native-webrtc/lib/typescript/RTCSessionDescription";
import { typeLog } from "./utils/logger";
import type { SignedCredential } from "./services/peer-key-service";
typeLog.debug("[shared/types] module loaded");

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
        iceRestart?: boolean;
        reason?: string;
        sender: string;
        ipAddress: string;
        port: number;
        credential?: SignedCredential;
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
        credential?: SignedCredential;
      };
    }
  | {
      type: "handshake";
      data: {
        to: string;
        ipAddress: string;
        port: number;
        sender: string;
        wsAllowed?: boolean;
      };
    }
  ;

export type ChatMessage = { type: "chat"; data: DataChatMessageI };
export type DataAckMessage = { messageId: string; from: string; to: string };
export type AckMessage = { type: "ack"; data: DataAckMessage };
export type DataSeenMessageI = {
  conversationId: string;
  from: string;
  to: string;
};
export type SeenMessage = { type: "seen"; data: DataSeenMessageI };

export type AudioCallMessage = {
  type: "audio-call";
  data: {
    from: string;
    to: string;
    conversationId?: string;
    callerName: string;
    callId?: string;
  };
};
export type VideoCallMessage = {
  type: "video-call";
  data: {
    from: string;
    to: string;
    conversationId?: string;
    callerName: string;
    callId?: string;
  };
};
export type CallEndedMessage = {
  type: "call-ended";
  data: {
    from: string;
    to: string;
    status?: "completed" | "missed" | "rejected";
    endedAt?: number;
    durationSeconds?: number;
    initiatorId?: string;
    messageId?: string;
    conversationId?: string;
    callType?: "audio" | "video";
  };
};
export type CallReadyMessage = {
  type: "call-ready";
  data: { from: string; to: string };
};
export type CallRejectedMessage = {
  type: "call-rejected";
  data: {
    from: string;
    to: string;
    reason?: "declined" | "busy";
    callId?: string;
    conversationId?: string;
    messageId?: string;
    callType?: "audio" | "video";
  };
};
export type CallMissedMessage = {
  type: "call-missed";
  data: { from: string; to: string; reason?: "no-answer" };
};

export type WsAudioCallMessage = {
  type: "audio-call";
  data: {
    from_user: string;
    to: string;
    conversationId?: string;
    callerName: string;
    callId?: string;
  };
};
export type WsVideoCallMessage = {
  type: "video-call";
  data: {
    from_user: string;
    to: string;
    conversationId?: string;
    callerName: string;
    callId?: string;
  };
};
export type WsCallEndedMessage = {
  type: "call-ended";
  data: {
    from_user: string;
    to: string;
    status?: "completed" | "missed" | "rejected";
    endedAt?: number;
    durationSeconds?: number;
    initiatorId?: string;
    messageId?: string;
    conversationId?: string;
    callType?: "audio" | "video";
  };
};
export type WsCallReadyMessage = {
  type: "call-ready";
  data: { from_user: string; to: string };
};
export type WsCallRejectedMessage = {
  type: "call-rejected";
  data: {
    from_user: string;
    to: string;
    reason?: "declined" | "busy";
    callId?: string;
    conversationId?: string;
    messageId?: string;
    callType?: "audio" | "video";
  };
};
export type WsCallMissedMessage = {
  type: "call-missed";
  data: { from_user: string; to: string; reason?: "no-answer" };
};

export type CallControlData = {
  enabled: boolean;
  from: string;
};
export type CallControlMessage = {
  type: "camera_toggle" | "mic_toggle";
  data: CallControlData;
};

/**
 * For sent and received message via webrtc
 */
export type WebrtcDataMessage =
  | ChatMessage
  | AckMessage
  | SeenMessage
  | CallMessage
  | CallControlMessage
  | LivenessMessage;

/**
 * Application-level liveness probe over the WebRTC data channel. Used to confirm
 * the link can actually round-trip data both ways — `connectionState === "connected"`
 * alone can lie (half-open / stale connections), so each peer pings and the other
 * replies with a matching `pong`. Intercepted inside `WebrtcAdapter` and never
 * surfaced to chat handling.
 */
export type LivenessMessage =
  | { type: "ping"; data: { nonce: number } }
  | { type: "pong"; data: { nonce: number } };

export type ProfileInfoMessage = {
  type: "profile-info";
  data: {
    from: string;
    username: string;
    firstName: string;
    lastName?: string;
  };
};

/**
 * For sent and received message via tcp and web socket
 */
export type Message = SignalingMessage | CallMessage | ProfileInfoMessage;

export type CallMessage =
  | AudioCallMessage
  | CallEndedMessage
  | VideoCallMessage
  | CallReadyMessage
  | CallRejectedMessage
  | CallMissedMessage;

export type WsCallMessage =
  | WsAudioCallMessage
  | WsCallEndedMessage
  | WsVideoCallMessage
  | WsCallReadyMessage
  | WsCallRejectedMessage
  | WsCallMissedMessage;

export type SmsMessage = {
  type: "chat";
  data: {
    from: string;
    to: string;
    message: string;
    conversationId: string;
    messageId: string;
    sentAt: number;
    messageType: "sms";
    senderProfile: {
      username: string;
      firstName: string;
      lastName: string;
    };
  };
};

export type ServerAckMessage = {
  type: "server-ack";
  data: {
    message_type: "chat" | "call-ended" | "ack" | "seen";
    messageId: string;
    from: string;
    to: string;
  };
};

export type GetActiveUsersMessage = { type: "get-active-users" };

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
  /** Primary (preferred) address used for dialing. */
  ipAddress: string;
  /** All addresses advertised by the peer (e.g. Wi-Fi + Ethernet). */
  addresses: string[];
  /** Epoch ms of the most recent mDNS resolve for this peer. */
  lastSeenAt: number;
}

export type QRPayload = {
  id: string;
  firstName: string;
  lastName: string;
  username:string;
  ip?: string;
  port?: number;
};
export interface PublishedService {
  type: string;
  protocol: string;
  domain: string;
  name: string;
  port: number;
  txt: { id: string; username: string; firstName: string; lastName?: string };
}
