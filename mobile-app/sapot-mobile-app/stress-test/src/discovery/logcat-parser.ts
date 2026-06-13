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
  // react-native-logs puts the metadata object on the next line(s), so we use
  // [\s\S]{0,200} to cross newlines between the label and the "port" field.
  const match = logText.match(/network › config constructed[\s\S]{0,200}"port"\s*:\s*(\d+)/);
  if (!match) return null;
  const port = parseInt(match[1], 10);
  return isNaN(port) ? null : port;
}

/**
 * Extracts the userId from the dev/preview-only beacon line in a logcat dump.
 * react-native-logs emits the metadata object on the next line(s), e.g.:
 *   user | INFO : user › beacon
 *   {
 *     "userId": "<uuid>"
 *   }
 */
export function parseUserId(logText: string): string | null {
  // [\s\S]{0,200} crosses newlines between the label and the "userId" field.
  const match = logText.match(/user › beacon[\s\S]{0,200}"userId"\s*:\s*"([^"]+)"/);
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
