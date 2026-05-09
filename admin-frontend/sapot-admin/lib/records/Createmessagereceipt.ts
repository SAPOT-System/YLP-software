import { db } from "../db";
import { addMutation } from "../sync/mutationQueue";

export async function createMessageReceipt({
  id,
  message_id,
  user_id,
  status,
}: {
  id: string;
  message_id: string;
  user_id: string;
  status: "sent" | "delivered" | "read";
}) {
  const now = Date.now();

  const receipt = {
    id,
    message_id,
    user_id,
    status,
    created_at: now,
    updated_at: now,
    is_deleted: false,
  };

  await db.message_receipts.put(receipt);

  addMutation({
    table: "message_receipts",
    type: "create",
    payload: receipt,
  });

  return receipt;
}

export async function updateMessageReceiptStatus({
  message_id,
  user_id,
  status,
}: {
  message_id: string;
  user_id: string;
  status: "sent" | "delivered" | "read";
}) {
  const now = Date.now();

  // Find the existing receipt for this message + user
  const existing = await db.message_receipts
    .where("message_id")
    .equals(message_id)
    .filter((r) => r.user_id === user_id)
    .first();

  if (!existing) return null;

  const updated = {
    ...existing,
    status,
    updated_at: now,
  };

  await db.message_receipts.put(updated);

  addMutation({
    table: "message_receipts",
    type: "update",
    payload: updated,
  });

  return updated;
}

export async function markConversationMessagesAsRead({
  conversation_id,
  current_user_id,
}: {
  conversation_id: string;
  current_user_id: string;
}) {
  const now = Date.now();

  // Get all messages in the conversation not sent by current user
  const messages = await db.messages
    .where("conversation_id")
    .equals(conversation_id)
    .filter((m) => m.sender_id !== current_user_id)
    .toArray();

  const messageIds = messages.map((m) => m.id);
  if (messageIds.length === 0) return;

  // Find receipts for those messages belonging to current user
  const receipts = await db.message_receipts
    .where("message_id")
    .anyOf(messageIds)
    .filter((r) => r.user_id === current_user_id && r.status !== "read")
    .toArray();

  for (const receipt of receipts) {
    const updated = { ...receipt, status: "read" as const, updated_at: now };
    await db.message_receipts.put(updated);
    addMutation({
      table: "message_receipts",
      type: "update",
      payload: updated,
    });
  }
}
