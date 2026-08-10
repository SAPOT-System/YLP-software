import { chatTypesLog } from "@/features/shared/core/utils/logger";
chatTypesLog.debug("[chat/types] module loaded");

// Wire-format types now live in the engine core; re-exported here so existing
// chat-domain imports keep working without any changes.
export type {
  SenderProfile,
  DataChatMessageI,
  SendPublicChatPayload,
} from "@/features/shared/core/messaging-types";

/**
 * Must match the server's `content` column limit in
 * server/app/models/message.py (Message.content max_length).
 */
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * This is enum for determining where the chat room is triggered, it is either in peer list item or chat list item
 */
export enum ChatRoomSource {
  PEER = "peer_list",
  CHAT = "chat_list",
}

export interface PublicChatMessage {
  id?: string;
  type: "public-chat";
  content: string;
  is_deleted: boolean;
  sender_id: string;
  sender_name?: string;
  received_at: Date;
}
