import { Peer } from "@/features/shared/core/database/model/Peer";
import { usePeerService } from "@/features/shared/hooks/use-peer-service";
import { useProfilePhoto } from "@/features/shared/hooks/use-profile-photo";
import { hookLog, uiLog } from "@/features/shared/core/utils/logger";
import { useEffect, useState } from "react";

hookLog.debug("[use-peer-info] module loaded");

export function usePeerInfo(peerId: string | null): {
  peer: Peer | null;
  peerDisplayName: string;
  peerPhotoUrl: string | null | undefined;
} {
  const peerService = usePeerService();
  const [peer, setPeer] = useState<Peer | null>(null);
  const { url: peerPhotoUrl } = useProfilePhoto(peerId ?? "");

  const peerDisplayName = peer
    ? [peer.firstName, peer.lastName].filter(Boolean).join(" ")
    : "";

  useEffect(() => {
    if (!peerId) return;
    uiLog.debug("[CallContext] loading peer", { peerId });
    peerService
      .findPeerById(peerId)
      .then((p: unknown) => setPeer(p as Peer))
      .catch((error) => {
        uiLog.error("[CallContext] Error in load peer", { error });
      });
  }, [peerId, peerService]);

  return { peer, peerDisplayName, peerPhotoUrl };
}
