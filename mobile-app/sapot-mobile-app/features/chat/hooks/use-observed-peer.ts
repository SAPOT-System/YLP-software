import { database, Peer } from "@/features/shared";
import { uiLog } from "@/features/shared/utils/logger";
import { Q } from "@nozbe/watermelondb";
import { useEffect, useState } from "react";

/**
 * Observes a single peer by id and keeps the returned record in sync.
 *
 * Uses a query-based observable rather than `findAndObserve` on purpose:
 * `findAndObserve` errors permanently when the row does not exist at
 * subscription time and never recovers once the row is later created. A query
 * observable instead emits `undefined` while the row is missing and re-emits
 * the record as soon as it is inserted — so PEER-source chats (search results,
 * QR scans) that resolve before the peer is persisted self-heal instead of
 * showing "Unknown user" forever.
 *
 * @param peerId The peer id to observe, or undefined to observe nothing.
 * @returns The observed peer, or undefined while absent.
 */
export function useObservedPeer(peerId: string | undefined): Peer | undefined {
  const [peer, setPeer] = useState<Peer | undefined>();

  useEffect(() => {
    // Reset so a previous peer's record never lingers while the next resolves.
    setPeer(undefined);
    if (!peerId) return;

    const subscription = database
      .get<Peer>(Peer.table)
      .query(Q.where("id", peerId))
      .observe()
      .subscribe({
        next: (rows) => setPeer(rows[0]),
        error: (err) =>
          uiLog.error("chat › peer observe failed", { peerId, error: err }),
      });

    return () => subscription.unsubscribe();
  }, [peerId]);

  return peer;
}
