/**
 * Formats a timestamp as a short relative string, e.g. "5m ago".
 * Accepts epoch milliseconds (number) or an ISO date string.
 */
export function formatRelativeTime(input: number | string): string {
  const target =
    typeof input === "number" ? input : new Date(input).getTime();
  if (!Number.isFinite(target)) return "";

  const diff = Math.max(0, Math.floor((Date.now() - target) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
