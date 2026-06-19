/**
 * Phone-side session log parser (stress-test side of ADR-0005).
 *
 * The app emits session lifecycle log lines in development/preview builds (issue 0007).
 * This module parses those lines from a logcat dump and classifies ICE failures as
 * phone-refused vs never-arrived.
 *
 * Log format contract (documented here for issue 0007 to implement):
 *
 *   Single-line:
 *     session › accepted {"sessionId":"<id>","peerId":"<id>","activeSessions":<n>}
 *     session › rejected {"sessionId":"<id>","peerId":"<id>","reason":"<str>","activeSessions":<n>}
 *     session › active-count {"count":<n>}
 *
 *   Multi-line (react-native-logs device format):
 *     session | INFO : session › accepted
 *     {
 *       "sessionId": "<id>",
 *       "peerId": "<id>",
 *       "activeSessions": <n>
 *     }
 */

export interface SessionAccepted {
  kind: 'accepted';
  sessionId: string | null;
  peerId: string | null;
  activeSessions: number | null;
}

export interface SessionRejected {
  kind: 'rejected';
  sessionId: string | null;
  peerId: string | null;
  reason: string | null;
  activeSessions: number | null;
}

export interface ActiveCountEvent {
  kind: 'active-count';
  count: number;
}

export type SessionEvent = SessionAccepted | SessionRejected | ActiveCountEvent;

// How many characters after the keyword to scan for JSON fields.
const PAYLOAD_WINDOW = 300;

function extractStr(text: string, field: string): string | null {
  const m = text.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`));
  return m ? m[1] : null;
}

function extractNum(text: string, field: string): number | null {
  const m = text.match(new RegExp(`"${field}"\\s*:\\s*(\\d+)`));
  return m ? parseInt(m[1], 10) : null;
}

type Tagged = { offset: number; event: SessionEvent };

function scanKind(logText: string, keyword: string, build: (window: string) => SessionEvent | null): Tagged[] {
  const re = new RegExp(`session › ${keyword}`, 'g');
  const out: Tagged[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(logText)) !== null) {
    const window = logText.slice(m.index, m.index + PAYLOAD_WINDOW);
    const event = build(window);
    if (event !== null) {
      out.push({ offset: m.index, event });
    }
  }
  return out;
}

export function parseSessionEvents(logText: string): SessionEvent[] {
  const accepted = scanKind(logText, 'accepted', (w) => ({
    kind: 'accepted' as const,
    sessionId: extractStr(w, 'sessionId'),
    peerId: extractStr(w, 'peerId'),
    activeSessions: extractNum(w, 'activeSessions'),
  }));

  const rejected = scanKind(logText, 'rejected', (w) => ({
    kind: 'rejected' as const,
    sessionId: extractStr(w, 'sessionId'),
    peerId: extractStr(w, 'peerId'),
    reason: extractStr(w, 'reason'),
    activeSessions: extractNum(w, 'activeSessions'),
  }));

  const activeCounts = scanKind(logText, 'active-count', (w) => {
    const count = extractNum(w, 'count');
    if (count === null) return null;
    return { kind: 'active-count' as const, count };
  });

  const all = [...accepted, ...rejected, ...activeCounts];
  all.sort((a, b) => a.offset - b.offset);
  return all.map((t) => t.event);
}

/**
 * Classify ICE establishment failures from phone session events.
 *
 * - phoneRefused: sessions the phone explicitly rejected (rejected events)
 * - arrivedButStalled: offers the phone accepted into WebRTC but ICE never finished
 *   (capped at unaccounted timeouts so it never exceeds connectionTimeouts - phoneRefused)
 * - neverArrived: timeouts with no matching accepted or rejected event
 */
export function classifyFailures(
  events: SessionEvent[],
  connectionTimeouts: number,
): { phoneRefused: number; arrivedButStalled: number; neverArrived: number } {
  const phoneRefused = events.filter((e) => e.kind === 'rejected').length;
  const acceptedCount = events.filter((e) => e.kind === 'accepted').length;
  const remaining = Math.max(0, connectionTimeouts - phoneRefused);
  const arrivedButStalled = Math.min(acceptedCount, remaining);
  const neverArrived = remaining - arrivedButStalled;
  return { phoneRefused, arrivedButStalled, neverArrived };
}
