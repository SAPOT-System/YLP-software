const KEY = "last_pulled_at";

export function getLastPulledAt(): number {
  if (typeof window === "undefined") return 0;

  const value = localStorage.getItem(KEY);
  return value ? Number(value) : 0;
}

export function setLastPulledAt(ts: number) {
  if (typeof window === "undefined") return;

  localStorage.setItem(KEY, String(ts));
}
