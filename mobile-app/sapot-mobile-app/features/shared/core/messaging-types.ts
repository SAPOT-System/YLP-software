import { MessageType } from "@/features/shared/database/model/Message";

/**
 * Wire-format types shared between the engine (ConnectionService, SignalingService,
 * WebrtcSessionManager, WsSignalingAdapter, WsMessageParser) and the chat domain.
 *
 * These live here — not in features/chat — so the engine layer has no upward dependency
 * on a domain feature.
 */

export interface SenderProfile {
  username: string;
  firstName: string;
  lastName?: string;
}

export interface DataChatMessageI {
  message: string; //TODO: implement enum
  conversationId: string;
  messageId: string;
  from: string;
  to: string;
  sentAt: Date;
  messageType: MessageType;
  senderProfile: SenderProfile;
  linkedMessageId?: string;
}

export interface SendPublicChatPayload {
  type: "public-chat";
  content: string;
  from: string;
  created_at: number;
  updated_at: number;
  is_deleted: boolean;
  sender_first_name: string;
  sender_last_name?: string;
  sender_username: string;
}
