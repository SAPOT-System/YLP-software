import { parseSessionEvents, classifyFailures, SessionEvent } from '@/discovery/session-log-parser';

// -- Fixture lines ------------------------------------------------------------

const NOISE = '01-01 12:00:00.000  1234  5678 I SomeTag: something unrelated happened';

// Single-line format (JSON on same line as keyword):
const ACCEPTED_SINGLE =
  '01-01 12:00:00.001  1234  5678 I ReactNativeJS: session › accepted ' +
  '{"sessionId":"sess-abc","peerId":"peer-001","activeSessions":2}';

const REJECTED_SINGLE =
  '01-01 12:00:00.002  1234  5678 I ReactNativeJS: session › rejected ' +
  '{"sessionId":"sess-xyz","peerId":"peer-002","reason":"limit-exceeded","activeSessions":5}';

const ACTIVE_COUNT_SINGLE =
  '01-01 12:00:00.003  1234  5678 I ReactNativeJS: session › active-count {"count":3}';

// Multi-line format — what react-native-logs actually emits on device:
const ACCEPTED_MULTILINE = [
  '01-01 12:00:00.001  1234  5678 I ReactNativeJS:  LOG  session | INFO : session › accepted',
  '{',
  '  "sessionId": "sess-abc",',
  '  "peerId": "peer-001",',
  '  "activeSessions": 2',
  '}',
].join('\n');

const REJECTED_MULTILINE = [
  '01-01 12:00:00.002  1234  5678 I ReactNativeJS:  LOG  session | INFO : session › rejected',
  '{',
  '  "sessionId": "sess-xyz",',
  '  "peerId": "peer-002",',
  '  "reason": "limit-exceeded",',
  '  "activeSessions": 5',
  '}',
].join('\n');

const ACTIVE_COUNT_MULTILINE = [
  '01-01 12:00:00.003  1234  5678 I ReactNativeJS:  LOG  session | INFO : session › active-count',
  '{',
  '  "count": 3',
  '}',
].join('\n');

// -- Tests --------------------------------------------------------------------

describe('session-log-parser', () => {
  describe('parseSessionEvents', () => {
    it('returns empty array for empty input', () => {
      expect(parseSessionEvents('')).toEqual([]);
    });

    it('returns empty array for unrelated noise', () => {
      expect(parseSessionEvents(NOISE)).toEqual([]);
    });

    it('parses a single-line accepted event with all fields', () => {
      const events = parseSessionEvents(ACCEPTED_SINGLE);
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.kind).toBe('accepted');
      if (e.kind === 'accepted') {
        expect(e.sessionId).toBe('sess-abc');
        expect(e.peerId).toBe('peer-001');
        expect(e.activeSessions).toBe(2);
      }
    });

    it('parses a single-line rejected event with all fields', () => {
      const events = parseSessionEvents(REJECTED_SINGLE);
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.kind).toBe('rejected');
      if (e.kind === 'rejected') {
        expect(e.sessionId).toBe('sess-xyz');
        expect(e.peerId).toBe('peer-002');
        expect(e.reason).toBe('limit-exceeded');
        expect(e.activeSessions).toBe(5);
      }
    });

    it('parses a single-line active-count event', () => {
      const events = parseSessionEvents(ACTIVE_COUNT_SINGLE);
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.kind).toBe('active-count');
      if (e.kind === 'active-count') {
        expect(e.count).toBe(3);
      }
    });

    it('parses a multi-line accepted event', () => {
      const events = parseSessionEvents(ACCEPTED_MULTILINE);
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.kind).toBe('accepted');
      if (e.kind === 'accepted') {
        expect(e.sessionId).toBe('sess-abc');
        expect(e.activeSessions).toBe(2);
      }
    });

    it('parses a multi-line rejected event', () => {
      const events = parseSessionEvents(REJECTED_MULTILINE);
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.kind).toBe('rejected');
      if (e.kind === 'rejected') {
        expect(e.reason).toBe('limit-exceeded');
        expect(e.activeSessions).toBe(5);
      }
    });

    it('parses a multi-line active-count event', () => {
      const events = parseSessionEvents(ACTIVE_COUNT_MULTILINE);
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.kind).toBe('active-count');
      if (e.kind === 'active-count') {
        expect(e.count).toBe(3);
      }
    });

    it('returns events in log order when interleaved with noise', () => {
      const log = [NOISE, ACCEPTED_SINGLE, NOISE, REJECTED_SINGLE, ACTIVE_COUNT_SINGLE, NOISE].join('\n');
      const events = parseSessionEvents(log);
      expect(events).toHaveLength(3);
      expect(events[0].kind).toBe('accepted');
      expect(events[1].kind).toBe('rejected');
      expect(events[2].kind).toBe('active-count');
    });

    it('returns events in log order for multi-line format', () => {
      const log = [NOISE, REJECTED_MULTILINE, NOISE, ACCEPTED_MULTILINE, NOISE].join('\n');
      const events = parseSessionEvents(log);
      expect(events).toHaveLength(2);
      expect(events[0].kind).toBe('rejected');
      expect(events[1].kind).toBe('accepted');
    });

    it('parses multiple accepted events', () => {
      const log = [ACCEPTED_SINGLE, ACCEPTED_SINGLE].join('\n');
      const events = parseSessionEvents(log);
      expect(events).toHaveLength(2);
      expect(events.every(e => e.kind === 'accepted')).toBe(true);
    });

    it('tolerates malformed lines — accepted without JSON payload', () => {
      const malformed = '01-01 12:00:00.000  1234  5678 I ReactNativeJS: session › accepted GARBAGE!!!';
      const events = parseSessionEvents(malformed);
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.kind).toBe('accepted');
      if (e.kind === 'accepted') {
        expect(e.sessionId).toBeNull();
        expect(e.peerId).toBeNull();
        expect(e.activeSessions).toBeNull();
      }
    });

    it('tolerates malformed lines — rejected without reason field', () => {
      const partial = '01-01 12:00:00.000  1234  5678 I ReactNativeJS: session › rejected {"sessionId":"s1"}';
      const events = parseSessionEvents(partial);
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.kind).toBe('rejected');
      if (e.kind === 'rejected') {
        expect(e.sessionId).toBe('s1');
        expect(e.reason).toBeNull();
        expect(e.activeSessions).toBeNull();
      }
    });

    it('drops active-count events when count field is missing', () => {
      const broken = '01-01 12:00:00.000  1234  5678 I ReactNativeJS: session › active-count {}';
      const events = parseSessionEvents(broken);
      expect(events).toHaveLength(0);
    });

    it('ignores interleaved unrelated logcat noise', () => {
      const log = [
        NOISE,
        '01-01 12:00:00.000  1234  5678 I Network: tcp connection established',
        ACCEPTED_SINGLE,
        '01-01 12:00:00.004  1234  5678 I WebRTC: ICE connected',
        REJECTED_SINGLE,
      ].join('\n');
      const events = parseSessionEvents(log);
      expect(events).toHaveLength(2);
    });
  });

  describe('classifyFailures', () => {
    it('returns phoneRefused = 0 and neverArrived = 0 for empty events with no timeouts', () => {
      const result = classifyFailures([], 0);
      expect(result.phoneRefused).toBe(0);
      expect(result.neverArrived).toBe(0);
    });

    it('counts phone-refused from rejected events', () => {
      const events: SessionEvent[] = [
        { kind: 'rejected', sessionId: 's1', peerId: 'p1', reason: 'limit-exceeded', activeSessions: 5 },
        { kind: 'rejected', sessionId: 's2', peerId: 'p2', reason: 'limit-exceeded', activeSessions: 5 },
      ];
      const result = classifyFailures(events, 2);
      expect(result.phoneRefused).toBe(2);
      expect(result.neverArrived).toBe(0);
    });

    it('counts never-arrived as timeouts not explained by rejections', () => {
      const events: SessionEvent[] = [
        { kind: 'rejected', sessionId: 's1', peerId: 'p1', reason: 'limit-exceeded', activeSessions: 5 },
      ];
      const result = classifyFailures(events, 3);
      expect(result.phoneRefused).toBe(1);
      expect(result.neverArrived).toBe(2);
    });

    it('neverArrived is 0 when rejections exceed timeouts', () => {
      const events: SessionEvent[] = [
        { kind: 'rejected', sessionId: 's1', peerId: 'p1', reason: 'limit-exceeded', activeSessions: 5 },
        { kind: 'rejected', sessionId: 's2', peerId: 'p2', reason: 'limit-exceeded', activeSessions: 5 },
      ];
      const result = classifyFailures(events, 1);
      expect(result.phoneRefused).toBe(2);
      expect(result.neverArrived).toBe(0);
    });

    it('ignores accepted and active-count events in phone-refused count', () => {
      const events: SessionEvent[] = [
        { kind: 'accepted', sessionId: 's1', peerId: 'p1', activeSessions: 1 },
        { kind: 'active-count', count: 1 },
        { kind: 'rejected', sessionId: 's2', peerId: 'p2', reason: 'limit-exceeded', activeSessions: 5 },
      ];
      const result = classifyFailures(events, 2);
      expect(result.phoneRefused).toBe(1);
      expect(result.neverArrived).toBe(1);
    });
  });

  // Contract test: the exact format WebrtcSessionManager emits (issue 0007) must be parseable.
  // webrtcLog.info("session › accepted", { sessionId, peerId, activeSessions }) produces either:
  //   single-line: "webrtc | INFO : session › accepted {"sessionId":"...","peerId":"...","activeSessions":N}"
  //   multi-line: "webrtc | INFO : session › accepted\n{\n  ...\n}"
  describe('contract: app-emitted lines (issue 0007)', () => {
    it('parses the single-line format emitted by WebrtcSessionManager', () => {
      const line =
        '01-01 12:00:00.000  1234  5678 I ReactNativeJS:  LOG  webrtc | INFO : ' +
        'session › accepted {"sessionId":"peer-1-1718712000000","peerId":"peer-1","activeSessions":1}';
      const events = parseSessionEvents(line);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: 'accepted',
        sessionId: 'peer-1-1718712000000',
        peerId: 'peer-1',
        activeSessions: 1,
      });
    });

    it('parses the multi-line format emitted by WebrtcSessionManager', () => {
      const log = [
        '01-01 12:00:00.000  1234  5678 I ReactNativeJS:  LOG  webrtc | INFO : session › accepted',
        '{',
        '  "sessionId": "peer-2-1718712001000",',
        '  "peerId": "peer-2",',
        '  "activeSessions": 2',
        '}',
      ].join('\n');
      const events = parseSessionEvents(log);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: 'accepted',
        peerId: 'peer-2',
        activeSessions: 2,
      });
    });
  });
});
