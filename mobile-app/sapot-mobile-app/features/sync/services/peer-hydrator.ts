import { Database, Q } from "@nozbe/watermelondb";
import { toAppError } from "@/features/shared/errors";
import { syncLog } from "@/features/shared/utils/logger";
import type { PeerService } from "@/features/shared/services/peer-service";
import type { PeerRepository } from "@/features/shared/repositories/peer-repository";
import type { PushLocalDataRequestBody } from "../api/sync.api";

type SyncChanges = PushLocalDataRequestBody["changes"];

export class PeerHydrator {
  constructor(
    private readonly db: Database,
    private peerService: PeerService | undefined,
    private readonly peerRepository: PeerRepository | undefined,
  ) {}

  setPeerService(peerService: PeerService): void {
    this.peerService = peerService;
  }

  async hydrate(changes: SyncChanges): Promise<void> {
    if (!this.peerService) {
      syncLog.debug("sync › peer hydration skipped, no peerService");
      return;
    }

    const rawIds: (string | undefined)[] = [
      ...changes.conversation_participants.created.map((r) => r.user_id),
      ...changes.messages.created.map((r) => r.sender_id),
      ...changes.calls.created.map((r) => r.initiator_id),
      ...changes.call_participants.created.map((r) => r.user_id),
    ];

    const allIds = [...new Set(rawIds.filter((id): id is string => Boolean(id)))];
    if (allIds.length === 0) return;

    let existingPeerIds: Set<string>;
    try {
      const existing = await this.db
        .get("peers")
        .query(Q.where("id", Q.oneOf(allIds)))
        .fetch();
      existingPeerIds = new Set(existing.map((r) => r.id as string));
    } catch (error) {
      const appErr = toAppError(error, "sync");
      syncLog.warn("sync › peer hydration, existence check failed — skipping", appErr);
      return;
    }

    const missingIds = allIds.filter((id) => !existingPeerIds.has(id));
    if (missingIds.length === 0) return;

    syncLog.info("sync › peer hydration, fetching missing peers", {
      total: allIds.length,
      missing: missingIds.length,
    });

    // Sync only runs in server/auto mode where WebSocket is always allowed.
    const wsAllowedStub = { isWebSocketAllowed: () => true };

    const results = await Promise.allSettled(
      missingIds.map((id) => this.peerService!.getOrCreatePeerById(id, wsAllowedStub))
    );

    let hydrated = 0;
    let fallbacks = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        hydrated++;
      } else {
        const hydrationErr = toAppError(result.reason, "sync");
        syncLog.warn("sync › peer hydration, fetch failed — creating fallback peer", {
          peerId: missingIds[i],
          ...hydrationErr,
        });
        if (this.peerRepository) {
          try {
            await this.peerRepository.savePeer({
              id: missingIds[i],
              username: missingIds[i],
              firstName: "Unknown",
              lastName: "User",
            });
            fallbacks++;
          } catch (saveErr) {
            const saveAppErr = toAppError(saveErr, "sync");
            syncLog.warn("sync › peer hydration, fallback peer creation failed", {
              peerId: missingIds[i],
              ...saveAppErr,
            });
          }
        }
      }
    }

    syncLog.info("sync › peer hydration complete", { hydrated, fallbacks });
  }
}
