import { execSync } from 'child_process';

export interface NetworkSample {
  timestamp: number;
  wlanRxBytes: number;
  wlanTxBytes: number;
  tcpRetransSegs: number;
  rssiDbm: number | null;
  linkSpeedMbps: number | null;
}

export class NetworkSampler {
  private samples: NetworkSample[] = [];
  private timer?: NodeJS.Timeout;
  private wifiTimer?: NodeJS.Timeout;
  private lastRssi: number | null = null;
  private lastLinkSpeed: number | null = null;

  start(pollMs = 5000, wifiPollMs = 10000): void {
    this.sample();
    this.sampleWifi();
    this.timer = setInterval(() => this.sample(), pollMs);
    this.timer.unref();
    this.wifiTimer = setInterval(() => this.sampleWifi(), wifiPollMs);
    this.wifiTimer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
    clearInterval(this.wifiTimer);
  }

  reset(): void { this.samples = []; }
  getSamples(): NetworkSample[] { return [...this.samples]; }

  private sample(): void {
    try {
      let devRaw: string;
      let snmpRaw: string;

      try {
        devRaw = execSync('adb shell cat /proc/net/dev', { encoding: 'utf8', timeout: 2000 });
        snmpRaw = execSync('adb shell cat /proc/net/snmp', { encoding: 'utf8', timeout: 2000 });
      } catch {
        // Fallback to local Linux if adb fails
        devRaw = execSync('cat /proc/net/dev', { encoding: 'utf8', timeout: 2000 });
        snmpRaw = execSync('cat /proc/net/snmp', { encoding: 'utf8', timeout: 2000 });
      }

      this.samples.push({
        timestamp: Date.now(),
        ...parseNetDev(devRaw),
        tcpRetransSegs: parseSnmpRetrans(snmpRaw),
        rssiDbm: this.lastRssi,
        linkSpeedMbps: this.lastLinkSpeed,
      });
    } catch {
      this.samples.push({
        timestamp: Date.now(),
        wlanRxBytes: 0,
        wlanTxBytes: 0,
        tcpRetransSegs: 0,
        rssiDbm: null,
        linkSpeedMbps: null,
      });
    }
  }

  private sampleWifi(): void {
    try {
      const raw = execSync('adb shell dumpsys wifi | grep -E "RSSI|Link speed"', {
        encoding: 'utf8',
        timeout: 3000,
      });
      const rssiMatch = raw.match(/RSSI:\s*(-?\d+)/);
      const speedMatch = raw.match(/Link speed:\s*(\d+)/);
      this.lastRssi = rssiMatch ? parseInt(rssiMatch[1], 10) : null;
      this.lastLinkSpeed = speedMatch ? parseInt(speedMatch[1], 10) : null;
    } catch {
  console.log("error in sampleWifi");
    }
  }
}

function parseNetDev(raw: string): { wlanRxBytes: number; wlanTxBytes: number } {
  let bestRx = 0;
  let bestTx = 0;

  for (const line of raw.split('\n')) {
    const t = line.trim();
    // Prioritize wlan0, but accept any active interface (eth0, enp..., wlp...)
    // Skip lo (loopback) unless it's the only thing with traffic
    if (!t.includes(':') || t.startsWith('lo:')) continue;

    const p = t.split(/[:\s]+/);
    const rx = parseInt(p[1], 10) || 0;
    const tx = parseInt(p[9], 10) || 0;

    // Use the interface with the most traffic as the likely "active" one
    if (rx + tx > bestRx + bestTx) {
      bestRx = rx;
      bestTx = tx;
    }
  }
  return { wlanRxBytes: bestRx, wlanTxBytes: bestTx };
}

function parseSnmpRetrans(raw: string): number {
  const lines = raw.split('\n');
  const hi = lines.findIndex(l => l.startsWith('Tcp:') && l.includes('RetransSegs'));
  if (hi === -1) return 0;
  const headers = lines[hi].split(/\s+/);
  const values = lines[hi + 1]?.split(/\s+/) ?? [];
  const idx = headers.indexOf('RetransSegs');
  return idx !== -1 ? parseInt(values[idx], 10) || 0 : 0;
}
