import { db } from "../db";
import { addMutation } from "../sync/mutationQueue";

export async function createMessage({
  id,
  conversation_id,
  sender_id,
  content,
  message_type = "text",
}: {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type?: "text" | "file" | "call_log";
}) {
  const now = Date.now();

  const message = {
    id,
    conversation_id,
    sender_id,
    message_type,
    content,
    created_at: now,
    updated_at: now,
    is_deleted: false,
  };

  await db.messages.put(message);

  addMutation({
    table: "messages",
    type: "create",
    payload: message,
  });

  return message;
}
