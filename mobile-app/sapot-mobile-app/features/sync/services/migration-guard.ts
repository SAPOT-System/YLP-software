import { Database, Q } from "@nozbe/watermelondb";
import { Message } from "@/features/shared/core/database/model/Message";
import { syncLog } from "@/features/shared/core/utils/logger";
import type { PushLocalDataRequestBody } from "../api/sync.api";

type SyncChanges = PushLocalDataRequestBody["changes"];

export class MigrationGuard {
  private _skip = false;

  constructor(private readonly db: Database) {}

  scheduleSkip(): void {
    this._skip = true;
  }

  async computeSkips(changes: SyncChanges): Promise<Set<string>> {
    const localEncryptedUpdatesToSkip = new Set<string>();

    if (!this._skip) {
      return localEncryptedUpdatesToSkip;
    }

    this._skip = false;

    const encryptedServerUpdates = changes.messages.updated
      .filter((item) => ((item.content ?? "") as string).startsWith("ecdh:"))
      .map((item) => item.id ?? "")
      .filter(Boolean);

    if (encryptedServerUpdates.length === 0) {
      return localEncryptedUpdatesToSkip;
    }

    const localMsgs = await this.db
      .get<Message>(Message.table)
      .query(Q.where("id", Q.oneOf(encryptedServerUpdates)))
      .fetch();

    for (const m of localMsgs) {
      if (m.content.startsWith("ecdh:")) {
        localEncryptedUpdatesToSkip.add(m.id);
      }
    }

    if (localEncryptedUpdatesToSkip.size > 0) {
      syncLog.info(
        "sync › recovery: skipping server ecdh: overwrites for locally re-encrypted messages",
        { count: localEncryptedUpdatesToSkip.size }
      );
    }

    return localEncryptedUpdatesToSkip;
  }
}
