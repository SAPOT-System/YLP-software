import {
  PRESENCE_STALE_TTL_MS,
  PeerStatusInputs,
  resolvePeerStatus,
} from "../resolve-peer-status";

const NOW = 1_700_000_000_000;

const baseInputs = (overrides: Partial<PeerStatusInputs> = {}): PeerStatusInputs => ({
  isLinkHealthy: false,
  connectionPhase: "idle",
  isServerActive: false,
  isPeerOnline: false,
  lastSeenAt: undefined,
  now: NOW,
  ...overrides,
});

describe("resolvePeerStatus", () => {
  describe("active (shared reachable signals)", () => {
    test("returns Active now when the live P2P link is healthy", () => {
      const status = resolvePeerStatus(baseInputs({ isLinkHealthy: true }));
      expect(status).toEqual({ kind: "active", label: "Active now" });
    });

    test("returns Active now from server presence even without a link", () => {
      const status = resolvePeerStatus(baseInputs({ isServerActive: true }));
      expect(status).toEqual({ kind: "active", label: "Active now" });
    });

    test("returns Active now from a fresh mDNS sighting", () => {
      const status = resolvePeerStatus(
        baseInputs({ isPeerOnline: true, lastSeenAt: NOW - 1_000 })
      );
      expect(status.kind).toBe("active");
    });

    test("does NOT treat a stale mDNS sighting as active", () => {
      const status = resolvePeerStatus(
        baseInputs({
          isPeerOnline: true,
          lastSeenAt: NOW - PRESENCE_STALE_TTL_MS - 1,
        })
      );
      expect(status.kind).not.toBe("active");
    });
  });

  describe("synchronization: link failure never overrides presence", () => {
    test("stays Active now when link failed but server still reports presence", () => {
      const status = resolvePeerStatus(
        baseInputs({
          isLinkHealthy: false,
          connectionPhase: "idle", // failed/timeout collapse to idle phase
          isServerActive: true,
        })
      );
      expect(status).toEqual({ kind: "active", label: "Active now" });
    });

    test("never surfaces a 'Connection failed' style label", () => {
      const status = resolvePeerStatus(
        baseInputs({ lastSeenAt: NOW - 5_000, isPeerOnline: false })
      );
      expect(status.label.toLowerCase()).not.toContain("failed");
      expect(status.label.toLowerCase()).not.toContain("timeout");
    });
  });

  describe("transient overlays (only when not otherwise active)", () => {
    test("shows Connecting... while dialing an unreachable peer", () => {
      const status = resolvePeerStatus(
        baseInputs({ connectionPhase: "connecting" })
      );
      expect(status).toEqual({ kind: "connecting", label: "Connecting..." });
    });

    test("shows Reconnecting... on mid-session disruption", () => {
      const status = resolvePeerStatus(
        baseInputs({ connectionPhase: "reconnecting" })
      );
      expect(status).toEqual({ kind: "reconnecting", label: "Reconnecting..." });
    });

    test("presence beats a concurrent connecting phase", () => {
      const status = resolvePeerStatus(
        baseInputs({ connectionPhase: "connecting", isServerActive: true })
      );
      expect(status.kind).toBe("active");
    });
  });

  describe("resting offline states", () => {
    test("falls back to Last seen when a timestamp is known", () => {
      const status = resolvePeerStatus(
        baseInputs({ lastSeenAt: NOW - PRESENCE_STALE_TTL_MS - 1 })
      );
      expect(status.kind).toBe("lastSeen");
      expect(status.label.startsWith("Last seen")).toBe(true);
    });

    test("returns Offline when nothing is known", () => {
      const status = resolvePeerStatus(baseInputs());
      expect(status).toEqual({ kind: "offline", label: "Offline" });
    });
  });
});
