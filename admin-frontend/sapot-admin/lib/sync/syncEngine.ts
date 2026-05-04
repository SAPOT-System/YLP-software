import { applyChanges } from "./applyChanges";
import { getLastPulledAt, setLastPulledAt } from "./storage";
import { getQueue, saveQueue } from "./mutationQueue";

import { db } from "../db";

export async function pull(limit = 100) {
  let lastPulledAt = getLastPulledAt();

  let shouldContinue = true;

  while (shouldContinue) {
    const res = await fetch(
      `/api/sync/pull?last_pulled_at=${lastPulledAt}&limit=${limit}`
    );

    if (!res.ok) {
      throw new Error("Pull failed");
    }

    const data = await res.json();

    const { changes, timestamp } = data;

    await applyChanges(changes);

    /* =========================
       GLOBAL CURSOR UPDATE
    ========================= */
    setLastPulledAt(timestamp);

    /* =========================
       PAGINATION CHECK
    ========================= */
    const tables = Object.values(changes);

    const hasMore = tables.some(
      (table: any) => table?.has_more && table?.next_cursor
    );

    if (hasMore) {
      // Find the NEXT cursor (usually messages, but future-proof)
      const nextCursor = tables
        .map((t: any) => t?.next_cursor)
        .filter(Boolean)
        .sort((a: number, b: number) => a - b)[0]; // smallest cursor first

      lastPulledAt = nextCursor;
    } else {
      shouldContinue = false;
      lastPulledAt = timestamp;
    }
  }
}

/* =========================
   COLLECT LOCAL CHANGES
========================= */

async function collectChanges() {
  // TEMP: naive version (we’ll improve later)
  // You will later track _status: "pending"

  return {
    peers: { created: [], updated: [], deleted: [] },
    guest_user: { created: [], updated: [], deleted: [] },
    conversations: { created: [], updated: [], deleted: [] },
    conversation_participants: { created: [], updated: [], deleted: [] },
    messages: { created: [], updated: [], deleted: [] },
    message_receipts: { created: [], updated: [], deleted: [] },
    calls: { created: [], updated: [], deleted: [] },
    call_participants: { created: [], updated: [], deleted: [] },
  };
}


export async function push() {
  const lastPulledAt = getLastPulledAt();
  const queue = getQueue();

  if (queue.length === 0) return;

  const changes = await collectChanges();

  const res = await fetch(`/api/sync/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      changes,
      last_pulled_at: lastPulledAt,
    }),
  });

  /* =========================
     CONFLICT HANDLING
  ========================= */
  if (res.status === 409) {
    await pull();
    throw new Error("Conflict detected");
  }

  if (!res.ok) {
    // increase retry count
    const updatedQueue = queue.map((m) => ({
      ...m,
      retries: m.retries + 1,
    }));

    saveQueue(updatedQueue);

    throw new Error("Push failed");
  }

  /* =========================
     SUCCESS → CLEAR QUEUE
  ========================= */
  saveQueue([]);

  return res.json();
}


export async function sync() {
  // 1. push local changes
  await push();

  // 2. pull remote changes
  await pull();
}
