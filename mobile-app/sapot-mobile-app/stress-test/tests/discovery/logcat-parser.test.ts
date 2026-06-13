import { parsePort, parseUserId, parseIp, parseLogcat, ParseFailure } from '@/discovery/logcat-parser';

// Sample logcat lines as they appear in `adb logcat -v brief` output.
const PORT_LINE = '01-01 12:00:00.000  1234  5678 I ReactNativeJS: network › config constructed {"port":54321}';
const BEACON_LINE = '01-01 12:00:00.001  1234  5678 I ReactNativeJS: user › beacon {"userId":"abc-123-def-456"}';
const NOISE_LINE = '01-01 12:00:00.002  1234  5678 I SomeOtherTag: something unrelated happened';

const WLAN0_OUTPUT = `3: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP
    link/ether aa:bb:cc:dd:ee:ff brd ff:ff:ff:ff:ff:ff
    inet 192.168.1.42/24 brd 192.168.1.255 scope global wlan0
       valid_lft forever preferred_lft forever
    inet6 fe80::1/64 scope link
       valid_lft forever preferred_lft forever`;

describe('logcat-parser', () => {
  describe('parsePort', () => {
    it('extracts port from a network config constructed log line', () => {
      expect(parsePort(PORT_LINE)).toBe(54321);
    });

    it('returns null when the port line is absent', () => {
      expect(parsePort(NOISE_LINE)).toBeNull();
    });

    it('extracts port when embedded in a multi-line logcat dump', () => {
      const logcat = [NOISE_LINE, PORT_LINE, BEACON_LINE].join('\n');
      expect(parsePort(logcat)).toBe(54321);
    });

    it('handles port at the boundary of valid range (49152)', () => {
      const line = PORT_LINE.replace('54321', '49152');
      expect(parsePort(line)).toBe(49152);
    });
  });

  describe('parseUserId', () => {
    it('extracts userId from a user › beacon log line', () => {
      expect(parseUserId(BEACON_LINE)).toBe('abc-123-def-456');
    });

    it('returns null when the beacon line is absent', () => {
      expect(parseUserId(NOISE_LINE)).toBeNull();
    });

    it('extracts userId from a multi-line logcat dump', () => {
      const logcat = [PORT_LINE, BEACON_LINE, NOISE_LINE].join('\n');
      expect(parseUserId(logcat)).toBe('abc-123-def-456');
    });
  });

  describe('parseIp', () => {
    it('extracts IPv4 address from wlan0 ip addr output', () => {
      expect(parseIp(WLAN0_OUTPUT)).toBe('192.168.1.42');
    });

    it('returns null when no inet line is present', () => {
      expect(parseIp('3: wlan0: <BROADCAST> mtu 1500')).toBeNull();
    });

    it('ignores inet6 lines and returns only IPv4', () => {
      const ipv6Only = '3: wlan0:\n    inet6 fe80::1/64 scope link';
      expect(parseIp(ipv6Only)).toBeNull();
    });
  });

  describe('parseLogcat', () => {
    it('returns port and userId when both are present', () => {
      const logcat = [PORT_LINE, BEACON_LINE, NOISE_LINE].join('\n');
      const result = parseLogcat(logcat);
      expect(result.port).toBe(54321);
      expect(result.userId).toBe('abc-123-def-456');
    });

    it('returns null fields when lines are absent', () => {
      const result = parseLogcat(NOISE_LINE);
      expect(result.port).toBeNull();
      expect(result.userId).toBeNull();
    });

    it('returns only port when userId line is absent', () => {
      const result = parseLogcat(PORT_LINE);
      expect(result.port).toBe(54321);
      expect(result.userId).toBeNull();
    });
  });

  describe('ParseFailure', () => {
    it('includes the missing field names in the error message', () => {
      const err = new ParseFailure(['port', 'userId']);
      expect(err.message).toMatch(/port/);
      expect(err.message).toMatch(/userId/);
    });

    it('reports a single missing field clearly', () => {
      const err = new ParseFailure(['userId']);
      expect(err.message).toMatch(/userId/);
      expect(err.message).toMatch(/production build|userId line|beacon/i);
    });

    it('is an instance of Error', () => {
      expect(new ParseFailure(['port'])).toBeInstanceOf(Error);
    });
  });
});
