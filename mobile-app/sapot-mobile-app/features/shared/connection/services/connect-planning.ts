import type { AppMode } from "@/features/shared/core/stores/app-mode-store";

/** Signaling channel selected for a connect attempt. */
export type SignalingTransport = "ws" | "tcp" | "none";

export const LAN_CONNECT_TIMEOUT_MS = 7000;
export const SERVER_CONNECT_TIMEOUT_MS = 15000;
export const AUTO_CONNECT_TIMEOUT_MS = 10000;
export const MAX_CONNECT_RETRIES = 1;

/**
 * Build the de-duplicated dial list for a (possibly dual-homed) peer: the
 * preferred address first, then any other advertised addresses, falsy removed.
 */
export function dedupeCandidateAddresses(
  ipAddress?: string,
  addresses?: string[]
): string[] {
  return Array.from(
    new Set([ipAddress, ...(addresses ?? [])].filter((a): a is string => Boolean(a)))
  );
}

/** ws is preferred when configured; otherwise tcp if allowed; otherwise none. */
export function resolveSignalingTransport(
  isWsConfigured: boolean,
  canUseTcp: boolean
): SignalingTransport {
  return isWsConfigured ? "ws" : canUseTcp ? "tcp" : "none";
}

export function resolveConnectTimeoutMs(mode: AppMode): number {
  if (mode === "lan") return LAN_CONNECT_TIMEOUT_MS;
  if (mode === "server") return SERVER_CONNECT_TIMEOUT_MS;
  return AUTO_CONNECT_TIMEOUT_MS;
}

/** Retry once, and only when a signaling transport is available. */
export function shouldRetryConnect(
  retryCount: number,
  transport: SignalingTransport
): boolean {
  return retryCount < MAX_CONNECT_RETRIES && transport !== "none";
}

/**
 * Remove a listener from a WebRTC adapter that exposes either `off` or
 * `removeListener`. The adapter's static type declares neither, so we duck-type.
 */
export function removeAdapterListener(
  adapter: unknown,
  eventName: string,
  callback: (...args: unknown[]) => void
): void {
  const withListeners = adapter as {
    off?: (event: string, cb: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
  };
  if (typeof withListeners.off === "function") {
    withListeners.off(eventName, callback);
    return;
  }
  if (typeof withListeners.removeListener === "function") {
    withListeners.removeListener(eventName, callback);
  }
}
