import { applyChanges } from "./applyChanges";
import { getLastPulledAt, setLastPulledAt } from "./storage";

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

  const changes = await collectChanges();

  // 🚨 Important: avoid useless requests
  const hasChanges = Object.values(changes).some(
    (table: any) =>
      table?.created?.length ||
      table?.updated?.length ||
      table?.deleted?.length
  );

  if (!hasChanges) {
    return { status: "no-op" };
  }

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
     CONFLICT HANDLING (CRITICAL)
  ========================= */
  if (res.status === 409) {
    // Step 1: pull latest state
    await pull();

    // Step 2: DO NOT silently retry here
    // (avoid infinite loops — retry will happen in mutation queue later)
    throw new Error("Conflict detected. State refreshed.");
  }

  if (!res.ok) {
    throw new Error("Push failed");
  }

  const data = await res.json();

  return data;
}


export async function sync() {
  // 1. push local changes
  await push();

  // 2. pull remote changes
  await pull();
}
