import Bonjour from 'bonjour-service';
import { networkInterfaces } from 'os';
import { PhoneTarget } from './adb-runner';

/** Returns all non-loopback local IPv4 addresses on this machine. */
export function getLocalIps(): Set<string> {
  const result = new Set<string>();
  for (const ifaceList of Object.values(networkInterfaces())) {
    for (const iface of (ifaceList ?? [])) {
      if (iface.family === 'IPv4' && !iface.internal) result.add(iface.address);
    }
  }
  return result;
}

/** Returns the first local IPv4 address on the same /24 subnet as phoneIp, or undefined. */
export function detectLocalIp(phoneIp: string): string | undefined {
  const parts = phoneIp.split('.');
  if (parts.length !== 4) return undefined;
  const prefix = parts.slice(0, 3).join('.');

  for (const ifaceList of Object.values(networkInterfaces())) {
    for (const iface of (ifaceList ?? [])) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith(prefix + '.')) {
        return iface.address;
      }
    }
  }
  return undefined;
}

export async function discoverPhoneViaMdns(timeoutSec: number): Promise<PhoneTarget> {
  return new Promise((resolve, reject) => {
    const bonjour = new Bonjour();
    const startMs = Date.now();

    const logInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - startMs) / 1000);
      console.log(`[mdns] Waiting for phone beacon… (${elapsed}s elapsed)`);
    }, 2000);

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(
        `mDNS discovery timed out after ${timeoutSec}s — ` +
        `is the phone on the same WiFi and is the app open?`,
      ));
    }, timeoutSec * 1000);

    function cleanup() {
      clearInterval(logInterval);
      clearTimeout(timer);
      browser.stop();
      bonjour.destroy();
    }

    console.log('[mdns] Waiting for phone beacon… (0s elapsed)');

    const browser = bonjour.find({ type: 'lanchat' }, (service) => {
      // Snapshot local IPs at discovery time so we never mistake our own address for the phone's.
      const localIps = getLocalIps();
      const ip = (service.addresses ?? []).find(
        (a) =>
          /^\d+\.\d+\.\d+\.\d+$/.test(a) &&
          !a.startsWith('127.') &&
          !a.startsWith('169.254.') &&
          !localIps.has(a),
      );
      const txt = service.txt as Record<string, string> | undefined;
      const userId = txt?.id;
      const port = service.port;

      if (!ip || !userId || !port) return;

      cleanup();
      const hostIp = detectLocalIp(ip);
      console.log(`[mdns] Found: userId=${userId} ip=${ip} port=${port}${hostIp ? ` hostIp=${hostIp}` : ''}`);
      resolve({ ip, port, userId, hostIp });
    });
  });
}
