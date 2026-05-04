import { db } from "../db";
import { getQueue, saveQueue } from "./mutationQueue";
import { setLastPulledAt } from "./storage";

export function collectChanges() {
  const queue = getQueue();

  const grouped: Record<string, { created: any[]; updated: any[]; deleted: any[] }> = {
    messages: { created: [], updated: [], deleted: [] },
    conversations: { created: [], updated: [], deleted: [] },
    conversation_participants: { created: [], updated: [], deleted: [] },
    message_receipts: { created: [], updated: [], deleted: [] },
    calls: { created: [], updated: [], deleted: [] },
    call_participants: { created: [], updated: [], deleted: [] },
    // peers: { created: [], updated: [], deleted: [] },
  };

  for (const m of queue) {
    const table = grouped[m.table];
    if (!table) continue;

    switch (m.type) {
      case "create":
        table.created.push(m.payload);
        break;
      case "update":
        table.updated.push(m.payload);
        break;
      case "delete":
        table.deleted.push(m.payload);
        break;
    }
  }

  return grouped;
}

export async function clearSessionData() {
  // Clear Dexie
  await db.delete();
  await db.open();

  // Clear sync state
  saveQueue([]);
  setLastPulledAt(0);
}

