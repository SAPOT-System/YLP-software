import { discoverPhoneTarget, ExecFn } from '@/discovery/adb-runner';
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
