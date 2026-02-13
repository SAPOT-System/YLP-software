import { MessageType } from "../shared";

export interface DataChatMessageI {
  message: string; //TODO: implement enum
  conversationId: string;
  messageId: string;
  senderId: string;
  sentAt: Date;
  messageType: MessageType;
}

/**
 * This is enum for determining where the chat room is triggered, it is either in peer list item or chat list item
 */
export enum ChatRoomSource {
  PEER = "peer_list",
  CHAT = "chat_list",
}
