export interface LogcatResult {
  port: number | null;
  userId: string | null;
}

export type MissingField = 'ip' | 'port' | 'userId';

export class ParseFailure extends Error {
  constructor(missing: MissingField[]) {
    const fields = missing.join(', ');
    const userId = missing.includes('userId')
      ? ' (userId missing — are you running a production build? The user › beacon line requires a preview or development build.)'
      : '';
    super(`adb discovery failed: could not find ${fields}${userId}`);
    this.name = 'ParseFailure';
  }
}

/** Extracts the TCP listen port from a logcat dump. */
export function parsePort(logText: string): number | null {
  const match = logText.match(/network › config constructed[^\n]*"port"\s*:\s*(\d+)/);
  if (!match) return null;
  const port = parseInt(match[1], 10);
  return isNaN(port) ? null : port;
}

/**
 * Extracts the userId from the dev/preview-only beacon line in a logcat dump.
 * The app emits this as: user › beacon {"userId":"<uuid>"}
 */
export function parseUserId(logText: string): string | null {
  const match = logText.match(/user › beacon[^\n]*"userId"\s*:\s*"([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Extracts the IPv4 address from `adb shell ip addr show wlan0` output.
 * Ignores inet6 lines — returns only the first IPv4 address.
 */
export function parseIp(shellText: string): string | null {
  const match = shellText.match(/\binet\s+((?:\d{1,3}\.){3}\d{1,3})\/\d+/);
  return match ? match[1] : null;
}

/** Parses both port and userId from a single logcat dump. */
export function parseLogcat(logText: string): LogcatResult {
  return {
    port: parsePort(logText),
    userId: parseUserId(logText),
  };
}
