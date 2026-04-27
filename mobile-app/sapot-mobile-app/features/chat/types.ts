import { chatTypesLog } from "@/features/shared/utils/logger";
import { MessageType } from "../shared";
chatTypesLog.debug("[chat/types] module loaded");

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
}

/**
 * This is enum for determining where the chat room is triggered, it is either in peer list item or chat list item
 */
export enum ChatRoomSource {
  PEER = "peer_list",
  CHAT = "chat_list",
}

export interface PublicChatMessage {
  type: "public-chat";
  content: string;
  is_deleted: boolean;
  sender_id: string;
  received_at: Date;
}

export interface SendPublicChatPayload {
  type: "public-chat";
  content: string;
  from: string;
  created_at: number;
  updated_at: number;
  is_deleted: boolean;
}
