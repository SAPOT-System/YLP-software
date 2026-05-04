// features/conversations/createConversation.ts

import { db } from "../db";
import { addMutation } from "../sync/mutationQueue";

export async function createConversation({
  id,
  conversation_type,
  title = null,
}: {
  id: string;
  conversation_type: "direct" | "group";
  title?: string | null;
}) {
  const now = Date.now();

  const record = {
    id,
    conversation_type,
    title,
    created_at: now,
    updated_at: now,
    is_deleted: false,
  };

  /* =========================
     1. WRITE LOCALLY
  ========================= */

  await db.conversations.put(record);

  /* =========================
     2. QUEUE MUTATION
  ========================= */

  addMutation({
    table: "conversations",
    type: "create",
    payload: record,
  });
}
