import { MessageType } from "../shared";

export interface Peer {
  id: string;
  username: string;
  port: number;
  ipAddress: string;
  serviceName?: string;
  online?: boolean;
}

export interface MessageI<T> { 
  type: string; // TODO: implement enum
  data: T;
}

export interface SentMessageI {
  message: any; //TODO: implement enum
  conversationId: string;
  messageId: string;
  senderId: string;
  sentAt: Date;
  messageType: MessageType;
}
