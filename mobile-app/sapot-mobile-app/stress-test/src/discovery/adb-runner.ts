import { execSync } from 'child_process';
import { parsePort, parseUserId, parseIp, ParseFailure } from './logcat-parser';

export interface PhoneTarget {
  ip: string;
  port: number;
  userId: string;
  /** Laptop's own IP on the same subnet — auto-populated by mDNS discovery. */
  hostIp?: string;
}

export type ExecFn = (cmd: string) => string;

function defaultExec(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', timeout: 15_000 });
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function pad3(n: number): string { return String(n).padStart(3, '0'); }

function formatLogcatTimestamp(ms: number): string {
  const dt = new Date(ms);
  return `${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())} ` +
    `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}.${pad3(dt.getMilliseconds())}`;
}

/**
 * Dumps logcat output since sinceMs (phase start). Returns null if adb is unavailable;
 * returns empty string if adb ran but emitted no lines in the window.
 */
export async function scrapeSessionLog(sinceMs: number, exec: ExecFn = defaultExec): Promise<string | null> {
  try {
    return exec(`adb logcat -d -T "${formatLogcatTimestamp(sinceMs)}"`);
  } catch {
    return null;
  }
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
 * One-shot: scrapes logcat once and returns the phone target or throws.
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

/**
 * Retrying variant: polls adb logcat every 3 s until the phone target is found
 * or {@link timeoutSec} elapses. Fails fast (no retry) if no device is attached.
 */
export async function waitForPhoneViaAdb(
  timeoutSec = 60,
  exec: ExecFn = defaultExec,
): Promise<PhoneTarget> {
  assertDeviceAttached(exec);

  const deadlineMs = Date.now() + timeoutSec * 1000;
  let attempt = 0;

  while (true) {
    try {
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
    } catch (err) {
      if (!(err instanceof ParseFailure)) throw err;

      const remaining = deadlineMs - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `adb discovery timed out after ${timeoutSec}s — is the app open and a dev/preview build?`,
        );
      }

      attempt++;
      console.log(`[adb] Waiting for phone to appear in logcat… (${attempt * 3}s elapsed)`);
      await new Promise<void>((res) => setTimeout(res, Math.min(3000, remaining)));
    }
  }
}
