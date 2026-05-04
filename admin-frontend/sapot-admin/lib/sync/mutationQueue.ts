import { db } from "../db";

/**
 * We store mutations separately from tables
 * so we can retry safely.
 */

export type Mutation = {
  id: string;
  table: string;
  type: "create" | "update" | "delete";
  payload: any;
  created_at: number;
  retries: number;
};

const QUEUE_KEY = "mutation_queue";

/* =========================
   GET QUEUE
========================= */

export function getQueue(): Mutation[] {
  if (typeof window === "undefined") return [];

  const raw = localStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

/* =========================
   SAVE QUEUE
========================= */

export function saveQueue(queue: Mutation[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/* =========================
   ADD MUTATION
========================= */

export function addMutation(m: Omit<Mutation, "id" | "created_at" | "retries">) {
  const queue = getQueue();

  const exists = queue.some(
    (x) => x.table === m.table && x.payload.id === m.payload.id && x.type === m.type
  );
  
  if (exists) return;
  
  queue.push({
    id: crypto.randomUUID(),
    created_at: Date.now(),
    retries: 0,
    ...m,
  });

  saveQueue(queue);
}

export function clearMutations(ids: string[]) {
  const queue = getQueue();
  const filtered = queue.filter((m) => !ids.includes(m.id));
  saveQueue(filtered);
}
