// features/conversations/createConversationParticipant.ts

import { db } from "../db";
import { addMutation } from "../sync/mutationQueue";

export async function createConversationParticipant({
  id,
  conversation_id,
  user_id,
}: {
  id: string;
  conversation_id: string;
  user_id: string;
}) {
  const now = Date.now();

  const record = {
    id,
    conversation_id,
    user_id,
    joined_at: now,
    created_at: now,
    updated_at: now,
    is_deleted: false,
  };

  /* =========================
     1. WRITE LOCALLY
  ========================= */

  await db.conversation_participants.put(record);

  /* =========================
     2. QUEUE MUTATION
  ========================= */

  addMutation({
    table: "conversation_participants",
    type: "create",
    payload: record,
  });
}
