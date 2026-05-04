import Dexie, { Table } from "dexie";

/* =========================
   TYPES (Aligned with your schema)
========================= */

export type Peer = {
  id: string;
  username: string;
  first_name: string;
  last_name?: string | null;
  is_online: boolean;
  email?: string | null;
  phone_number?: string | null;
  email_verified?: boolean | null;
};

export type GuestUser = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
};

export type Conversation = {
  id: string;
  conversation_type: "direct" | "group";
  title?: string | null;
  created_at: number;
  updated_at: number;
  is_deleted: boolean;
};

export type ConversationParticipant = {
  id: string;
  conversation_id: string; // FK → conversations.id
  user_id: string; // FK → peers.id
  joined_at: number;
  created_at: number;
  updated_at: number;
  is_deleted: boolean;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: "text" | "file" | "call_log";
  content: string;
  created_at: number;
  updated_at: number;
  is_deleted: boolean;
};

export type MessageReceipt = {
  id: string;
  message_id: string;
  user_id: string;
  status: "sent" | "delivered" | "read";
  created_at: number;
  updated_at: number;
  is_deleted: boolean;
};

export type Call = {
  id: string;
  conversation_id: string;
  initiator_id: string;
  call_type: "audio" | "video";
  status: "completed" | "missed" | "rejected";
  start_time: number;
  end_time?: number | null;
  created_at: number;
  updated_at: number;
  is_deleted: boolean;
};

export type CallParticipant = {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: number;
  left_at?: number | null;
  created_at: number;
  updated_at: number;
  is_deleted: boolean;
};

/* =========================
   DATABASE
========================= */

class AppDB extends Dexie {
  peers!: Table<Peer, string>;
  guest_user!: Table<GuestUser, string>;

  conversations!: Table<Conversation, string>;
  conversation_participants!: Table<ConversationParticipant, string>;

  messages!: Table<Message, string>;
  message_receipts!: Table<MessageReceipt, string>;

  calls!: Table<Call, string>;
  call_participants!: Table<CallParticipant, string>;

  constructor() {
    super("chat-db");

    this.version(1).stores({
      /* =========================
         USERS
      ========================= */
      peers: "id, username, first_name, last_name",
      guest_user: "id",

      /* =========================
         CONVERSATIONS
      ========================= */
      conversations: "id, type, updated_at, is_deleted",
      conversation_participants:
        "id, conversation_id, user_id, updated_at, is_deleted",

      /* =========================
         MESSAGES
      ========================= */
      messages:
        "id, conversation_id, sender_id, created_at, updated_at, is_deleted",

      message_receipts:
        "id, message_id, user_id, status, updated_at, is_deleted",

      /* =========================
         CALLS
      ========================= */
      calls:
        "id, conversation_id, initiator_id, start_time, updated_at, is_deleted",

      call_participants:
        "id, user_id, conversation_id, joined_at, updated_at, is_deleted",
    });
  }
}

export const db = new AppDB();


