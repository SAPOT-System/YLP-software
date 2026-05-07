import { db, SyncChanges } from "../db";

/**
 * Apply backend sync changes into IndexedDB
 */
async function applyTableChanges<T extends { id: string; updated_at?: number }>(
  table: any,
  { created = [], updated = [], deleted = [] }: any
) {
  /* =========================
     CREATED → upsert
  ========================= */
  if (created.length) {
    await table.bulkPut(created);
  }

  /* =========================
     UPDATED → merge safely
  ========================= */
  if (updated.length) {
    for (const record of updated) {
      const existing = await table.get(record.id);

      if (!existing) {
        // backend rule: updated can create
        await table.put(record);
        continue;
      }

      // Only apply if newer
      if (
        record.updated_at &&
        existing.updated_at &&
        record.updated_at < existing.updated_at
      ) {
        continue;
      }

      await table.put({
        ...existing,
        ...record,
      });
    }
  }

  /* =========================
     DELETED → hard delete locally
     (backend uses soft delete, but client can remove)
  ========================= */
  if (deleted.length) {
    await table.bulkDelete(deleted);
  }
}

export async function applyChanges(changes: SyncChanges) {
  await db.transaction(
    "rw",
    db.conversations,
    db.messages,
    db.conversation_participants,
    db.calls,
    db.message_receipts,
    async () => {
      if (changes.conversations) {
        await applyTableChanges(db.conversations, changes.conversations);
      }

      if (changes.messages) {
        await applyTableChanges(db.messages, changes.messages);
      }

      if (changes.conversation_participants) {
        await applyTableChanges(
          db.conversation_participants,
          changes.conversation_participants
        );
      }

      if (changes.calls) {
        await applyTableChanges(db.calls, changes.calls);
      }

      if (changes.message_receipts) {
        await applyTableChanges(
          db.message_receipts,
          changes.message_receipts
        );
      }
    }
  );
}
