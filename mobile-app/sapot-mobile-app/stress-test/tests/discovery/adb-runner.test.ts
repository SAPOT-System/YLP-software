import { discoverPhoneTarget, scrapeSessionLog, ExecFn } from '@/discovery/adb-runner';
import { ParseFailure } from '@/discovery/logcat-parser';

const PORT_LINE = 'network › config constructed {"port":54321}';
const BEACON_LINE = 'user › beacon {"userId":"abc-123-def-456"}';
const WLAN0 = 'inet 192.168.1.42/24 brd 192.168.1.255 scope global wlan0';

const DEVICES_ONE = 'List of devices attached\nemulator-5554\tdevice\n';
const DEVICES_NONE = 'List of devices attached\n';

function makeExec(responses: Record<string, string>): ExecFn {
  return (cmd: string) => {
    for (const [key, val] of Object.entries(responses)) {
      if (cmd.includes(key)) return val;
    }
    throw new Error(`Unexpected exec command: ${cmd}`);
  };
}

describe('adb-runner', () => {
  it('returns PhoneTarget when all three fields are present', async () => {
    const exec = makeExec({
      'adb devices': DEVICES_ONE,
      'adb logcat': [PORT_LINE, BEACON_LINE].join('\n'),
      'ip addr show wlan0': WLAN0,
    });
    const target = await discoverPhoneTarget(exec);
    expect(target.ip).toBe('192.168.1.42');
    expect(target.port).toBe(54321);
    expect(target.userId).toBe('abc-123-def-456');
  });

  it('throws with actionable message when no adb device is attached', async () => {
    const exec = makeExec({ 'adb devices': DEVICES_NONE });
    await expect(discoverPhoneTarget(exec)).rejects.toThrow(/no device attached/i);
  });

  it('throws ParseFailure when userId is missing (production build)', async () => {
    const exec = makeExec({
      'adb devices': DEVICES_ONE,
      'adb logcat': PORT_LINE,
      'ip addr show wlan0': WLAN0,
    });
    await expect(discoverPhoneTarget(exec)).rejects.toBeInstanceOf(ParseFailure);
    await expect(discoverPhoneTarget(exec)).rejects.toThrow(/userId/);
  });

  it('throws ParseFailure when port is missing', async () => {
    const exec = makeExec({
      'adb devices': DEVICES_ONE,
      'adb logcat': BEACON_LINE,
      'ip addr show wlan0': WLAN0,
    });
    await expect(discoverPhoneTarget(exec)).rejects.toBeInstanceOf(ParseFailure);
    await expect(discoverPhoneTarget(exec)).rejects.toThrow(/port/);
  });

  it('throws ParseFailure when wlan0 has no IP', async () => {
    const exec = makeExec({
      'adb devices': DEVICES_ONE,
      'adb logcat': [PORT_LINE, BEACON_LINE].join('\n'),
      'ip addr show wlan0': '3: wlan0: <BROADCAST> mtu 1500',
    });
    await expect(discoverPhoneTarget(exec)).rejects.toBeInstanceOf(ParseFailure);
    await expect(discoverPhoneTarget(exec)).rejects.toThrow(/ip/i);
  });
});

describe('scrapeSessionLog', () => {
  it('returns logcat text when exec succeeds', async () => {
    const logLine = 'session › accepted {"sessionId":"s1","peerId":"p1","activeSessions":1}';
    const exec = makeExec({ 'adb logcat': logLine });
    const result = await scrapeSessionLog(Date.now(), exec);
    expect(result).toBe(logLine);
  });

  it('returns null when exec throws (adb unavailable)', async () => {
    const exec: ExecFn = () => { throw new Error('adb: command not found'); };
    const result = await scrapeSessionLog(Date.now(), exec);
    expect(result).toBeNull();
  });

  it('returns empty string (not null) when adb runs but emits no matching lines', async () => {
    const exec = makeExec({ 'adb logcat': '' });
    const result = await scrapeSessionLog(Date.now(), exec);
    expect(result).toBe('');
  });

  it('passes -d -T flag with MM-DD HH:MM:SS.mmm timestamp to logcat', async () => {
    let captured = '';
    const exec: ExecFn = (cmd) => { captured = cmd; return ''; };
    // 2026-06-18 14:30:45.123 local time
    const sinceMs = new Date(2026, 5, 18, 14, 30, 45, 123).getTime();
    await scrapeSessionLog(sinceMs, exec);
    expect(captured).toContain('adb logcat -d -T');
    expect(captured).toContain('06-18 14:30:45.123');
  });

  it('zero-pads month, day, hour, minute, second, and millisecond', async () => {
    let captured = '';
    const exec: ExecFn = (cmd) => { captured = cmd; return ''; };
    // 2026-01-05 03:07:09.005
    const sinceMs = new Date(2026, 0, 5, 3, 7, 9, 5).getTime();
    await scrapeSessionLog(sinceMs, exec);
    expect(captured).toContain('01-05 03:07:09.005');
  });
});
