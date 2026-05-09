import { db } from "../db";
import { addMutation } from "../sync/mutationQueue";

export async function createMessage({
  id,
  conversation_id,
  sender_id,
  content,
}: {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
}) {
  const now = Date.now();

  /* =========================
     1. WRITE LOCALLY (OPTIMISTIC)
  ========================= */

  await db.messages.put({
    id,
    conversation_id,
    sender_id,
    message_type: "text",
    content,
    created_at: now,
    updated_at: now,
    is_deleted: false,
  });
  
  /* =========================
     2. QUEUE MUTATION
  ========================= */
  
  addMutation({
    table: "messages",
    type: "create",
    payload: {
      id,
      conversation_id,
      sender_id,
      message_type: "text",
      content,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    },
  });
}
