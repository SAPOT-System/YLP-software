import { execSync } from 'child_process';
import { parsePort, parseUserId, parseIp, ParseFailure } from './logcat-parser';

export interface PhoneTarget {
  ip: string;
  port: number;
  userId: string;
}

export type ExecFn = (cmd: string) => string;

function defaultExec(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', timeout: 15_000 });
}

function assertDeviceAttached(exec: ExecFn): void {
  const output = exec('adb devices');
  const lines = output.trim().split('\n').slice(1).filter(l => l.trim());
  if (lines.length === 0) {
    throw new Error(
      'adb discovery failed: no device attached.\n' +
      'Attach the phone via USB and run `adb devices` to confirm it is listed.',
    );
  }
}

/**
 * Discovers the phone target (ip, port, userId) by scraping adb logcat.
 *
 * Requires an attached adb device running a preview or development build of the app.
 * Throws actionable errors for: no device, production build, missing log lines.
 */
export async function discoverPhoneTarget(exec: ExecFn = defaultExec): Promise<PhoneTarget> {
  assertDeviceAttached(exec);

  const logcat = exec('adb logcat -d -v brief');
  const port = parsePort(logcat);
  const userId = parseUserId(logcat);

  const missing: ('ip' | 'port' | 'userId')[] = [];
  if (port === null) missing.push('port');
  if (userId === null) missing.push('userId');
  if (missing.length > 0) throw new ParseFailure(missing);

  const wlan0 = exec('adb shell ip addr show wlan0');
  const ip = parseIp(wlan0);
  if (!ip) throw new ParseFailure(['ip']);

  return { ip, port: port as number, userId: userId as string };
}
