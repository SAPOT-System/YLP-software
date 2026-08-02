import { applyChanges } from "./applyChanges";
import { getLastPulledAt, setLastPulledAt } from "./storage";
import { getQueue, saveQueue, clearMutations, type Mutation } from "./mutationQueue";


export async function pull(limit = 100) {
  let lastPulledAt = getLastPulledAt();

  // Only committed to storage once the whole pagination loop succeeds,
  // so a mid-loop failure leaves the resume point at the pre-pull cursor
  // instead of skipping over pages that were never fetched.
  let finalTimestamp = lastPulledAt;

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

    finalTimestamp = timestamp;

    /* =========================
       PAGINATION CHECK
    ========================= */
    const tables = Object.values(changes) as {
      has_more?: boolean;
      next_cursor?: number;
    }[];

    const hasMore = tables.some((table) => table?.has_more && table?.next_cursor);

    if (hasMore) {
      // Find the NEXT cursor (usually messages, but future-proof).
      // Only tables that actually have more rows may move the cursor — a
      // drained table still reports its last updated_at, and taking that as
      // the minimum would drag the cursor backwards and refetch for ever.
      const nextCursor = tables
        .filter((t) => t?.has_more && t?.next_cursor)
        .map((t) => t.next_cursor as number)
        .sort((a, b) => a - b)[0]; // smallest cursor first

      // The server pages with `updated_at > last_pulled_at`, so a cursor that
      // does not advance would replay the same page indefinitely. Stop instead
      // of hanging the caller.
      if (!(nextCursor > lastPulledAt)) {
        shouldContinue = false;
        lastPulledAt = timestamp;
        break;
      }

      lastPulledAt = nextCursor;
    } else {
      shouldContinue = false;
    }
  }

  /* =========================
     GLOBAL CURSOR UPDATE
  ========================= */
  setLastPulledAt(finalTimestamp);
}

/* =========================
   COLLECT LOCAL CHANGES
========================= */

const typeMap = {
  create: "created",
  update: "updated",
  delete: "deleted",
} as const;

export async function collectChanges(queue: Mutation[] = getQueue()) {
  const grouped = {
    peers: { created: [], updated: [], deleted: [] },
    guest_user: { created: [], updated: [], deleted: [] },
    conversations: { created: [], updated: [], deleted: [] },
    conversation_participants: { created: [], updated: [], deleted: [] },
    messages: { created: [], updated: [], deleted: [] },
    message_receipts: { created: [], updated: [], deleted: [] },
    calls: { created: [], updated: [], deleted: [] },
    call_participants: { created: [], updated: [], deleted: [] },
  };

  for (const m of queue) {
    const table = grouped[m.table as keyof typeof grouped];
    const type = typeMap[m.type as keyof typeof typeMap];

    if (!table || !type) continue;

    table[type].push(m.payload);
  }

  return grouped;
}


export async function push() {
  await pull()
  const lastPulledAt = getLastPulledAt();
  const queue = getQueue();

  if (queue.length === 0) return;

  // Snapshot the ids being pushed so we only touch these mutations
  // afterwards, not anything queued concurrently during the request.
  const pushedIds = queue.map((m) => m.id);

  const changes = await collectChanges(queue);
  const res = await fetch(`/api/sync/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      changes: changes,
      last_pulled_at: lastPulledAt,
    }),
  });

  /* =========================
     CONFLICT HANDLING
  ========================= */
  if (res.status === 409) {
    throw new Error("Conflict detected");
  }

  if (!res.ok) {
    // increase retry count only for the mutations that were part of
    // this batch, re-reading the queue so anything added mid-flight
    // isn't clobbered
    const updatedQueue = getQueue().map((m) =>
      pushedIds.includes(m.id) ? { ...m, retries: m.retries + 1 } : m
    );

    saveQueue(updatedQueue);

    throw new Error("Push failed");
  }

  /* =========================
     SUCCESS → CLEAR ONLY PUSHED MUTATIONS
  ========================= */
  clearMutations(pushedIds);

  return res.json();
}


export async function sync() {
  // 1. push local changes
  await push();

  // 2. pull remote changes
  await pull();
}
