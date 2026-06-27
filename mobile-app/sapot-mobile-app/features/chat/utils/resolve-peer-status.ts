import { formatRelativeTime } from "@/features/shared/core/utils";

// Discovery marks a peer stale after this window without an mDNS sighting.
// Mirrors STALE_TTL_MS in discovery-service so the header trusts `isOnline`
// only while the underlying advertisement is still fresh.
export const PRESENCE_STALE_TTL_MS = 60_000;

/**
 * The resting kinds describe what the peer's presence actually is. The two
 * transient kinds (`connecting`/`reconnecting`) are surfaced only while a dial
 * is genuinely in flight AND no stronger presence signal already proves the
 * peer is reachable.
 */
export type PeerStatusKind =
  | "active"
  | "connecting"
  | "reconnecting"
  | "lastSeen"
  | "offline";

export interface PeerStatus {
  kind: PeerStatusKind;
  label: string;
}

export interface PeerStatusInputs {
  /** This device holds a healthy, established P2P link to the peer right now. */
  isLinkHealthy: boolean;
  /** The in-flight transport phase, used only for transient overlays. */
  connectionPhase: "connecting" | "reconnecting" | "idle";
  /** Server-side presence (WS active-users). Symmetric across both peers. */
  isServerActive: boolean;
  /** mDNS discovery flag from the peers table. */
  isPeerOnline: boolean;
  /** Last mDNS/server sighting in epoch ms, if known. */
  lastSeenAt?: number;
  /** Current time in epoch ms; injectable for deterministic tests. */
  now?: number;
}

/**
 * Resolves the single status the chat header shows for a peer.
 *
 * The resting label is presence-derived from a priority union of signals that
 * both devices share — a live link, server presence, or a fresh mDNS sighting —
 * so the two ends agree instead of each rendering its own private link verdict.
 *
 * Crucially, a dropped/failed P2P link is NOT surfaced as the peer's status:
 * if any presence signal still says the peer is reachable, the header stays
 * "Active now" while the reconnect loop runs silently underneath. Raw link
 * failure only ever degrades the label down to "Last seen"/"Offline", never to
 * a scary "Connection failed".
 */
export function resolvePeerStatus(inputs: PeerStatusInputs): PeerStatus {
  const {
    isLinkHealthy,
    connectionPhase,
    isServerActive,
    isPeerOnline,
    lastSeenAt,
    now = Date.now(),
  } = inputs;

  const isSightingFresh =
    lastSeenAt !== undefined && now - lastSeenAt < PRESENCE_STALE_TTL_MS;

  // 1–3: any shared "reachable" signal → Active now (mutual by construction).
  if (isLinkHealthy || isServerActive || (isPeerOnline && isSightingFresh)) {
    return { kind: "active", label: "Active now" };
  }

  // Transient overlays: only meaningful while genuinely dialing/recovering and
  // the peer is not otherwise proven active above.
  if (connectionPhase === "connecting") {
    return { kind: "connecting", label: "Connecting..." };
  }
  if (connectionPhase === "reconnecting") {
    return { kind: "reconnecting", label: "Reconnecting..." };
  }

  // Resting offline states. Link failure/timeout falls through to here.
  if (lastSeenAt !== undefined) {
    return { kind: "lastSeen", label: `Last seen ${formatRelativeTime(lastSeenAt)}` };
  }

  return { kind: "offline", label: "Offline" };
}
