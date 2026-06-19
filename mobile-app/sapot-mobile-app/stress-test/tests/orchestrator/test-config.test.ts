import { validateConfig, TestConfig } from '@/orchestrator/test-config';

const basePhase = { peerCount: 2, msgPerSec: 5, durationSec: 10 };

const baseTcpStarLan = { hostIp: '192.168.1.23', startPort: 9000, adbDiscovery: true as const };
const baseWs = { serverUrl: 'https://x', accountPrefix: 'p_', password: 'pw', iperfTargetIp: '192.168.1.1' };
const baseWrtc = { connectionTimeoutMs: 5000 };

describe('validateConfig — tcp-signaled mode (Star Mode only)', () => {
  it('throws when lan config is missing', () => {
    const config = {
      mode: 'tcp-signaled', webrtc: baseWrtc, phases: [basePhase], outputDir: './out',
    } as TestConfig;
    expect(() => validateConfig(config)).toThrow('lan config is required');
  });

  it('throws when webrtc config is missing', () => {
    const config = {
      mode: 'tcp-signaled', lan: baseTcpStarLan, phases: [basePhase], outputDir: './out',
    } as TestConfig;
    expect(() => validateConfig(config)).toThrow('webrtc config is required');
  });

  it('throws when no star mode fields are provided (pair mode is not supported)', () => {
    const config: TestConfig = {
      mode: 'tcp-signaled',
      lan: { hostIp: '127.0.0.1', startPort: 9100 },
      webrtc: baseWrtc,
      phases: [basePhase],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).toThrow('Star Mode');
  });

  it('throws when phoneIp is set without phonePort', () => {
    const config: TestConfig = {
      mode: 'tcp-signaled',
      lan: { hostIp: '127.0.0.1', startPort: 9200, phoneIp: '192.168.1.5' },
      webrtc: baseWrtc,
      phases: [basePhase],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).toThrow('lan.phonePort is required');
  });

  it('throws when phoneIp is set without phoneUserId', () => {
    const config: TestConfig = {
      mode: 'tcp-signaled',
      lan: { hostIp: '127.0.0.1', startPort: 9200, phoneIp: '192.168.1.5', phonePort: 9000 },
      webrtc: baseWrtc,
      phases: [basePhase],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).toThrow('lan.phoneUserId is required');
  });

  it('passes with adbDiscovery star mode', () => {
    const config: TestConfig = {
      mode: 'tcp-signaled',
      lan: { hostIp: '192.168.1.23', startPort: 9200, adbDiscovery: true },
      webrtc: baseWrtc,
      phases: [{ peerCount: 1, msgPerSec: 5, durationSec: 10 }],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('passes with mdnsDiscovery star mode', () => {
    const config: TestConfig = {
      mode: 'tcp-signaled',
      lan: { hostIp: '192.168.1.23', startPort: 9200, mdnsDiscovery: true },
      webrtc: baseWrtc,
      phases: [{ peerCount: 1, msgPerSec: 5, durationSec: 10 }],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('does not require hostIp when mdnsDiscovery is true (auto-detected at run time)', () => {
    const config: TestConfig = {
      mode: 'tcp-signaled',
      lan: { startPort: 9200, mdnsDiscovery: true },
      webrtc: baseWrtc,
      phases: [{ peerCount: 1, msgPerSec: 5, durationSec: 10 }],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('passes with manual star mode (phoneIp + phonePort + phoneUserId)', () => {
    const config: TestConfig = {
      mode: 'tcp-signaled',
      lan: { hostIp: '192.168.1.23', startPort: 9200, phoneIp: '192.168.1.5', phonePort: 9000, phoneUserId: 'user-123' },
      webrtc: baseWrtc,
      phases: [{ peerCount: 3, msgPerSec: 5, durationSec: 10 }],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('allows odd peerCount in star mode (all peers target the phone)', () => {
    const config: TestConfig = {
      mode: 'tcp-signaled',
      lan: baseTcpStarLan,
      webrtc: baseWrtc,
      phases: [{ peerCount: 3, msgPerSec: 5, durationSec: 10 }],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('canonical tcp-star config file is parseable and valid', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const raw = fs.readFileSync(path.resolve(__dirname, '../../stress-test.tcp-star.config.json'), 'utf8');
    const config = JSON.parse(raw) as TestConfig;
    expect(config.mode).toBe('tcp-signaled');
    expect(config.lan?.adbDiscovery).toBe(true);
    expect(config.lan?.phoneIp).toBeUndefined();
    expect(() => validateConfig(config)).not.toThrow();
  });
});

describe('validateConfig — ws-signaled mode', () => {
  it('throws when ws config is missing', () => {
    const config = {
      mode: 'ws-signaled', webrtc: baseWrtc, phases: [basePhase], outputDir: './out',
    } as TestConfig;
    expect(() => validateConfig(config)).toThrow('ws config is required');
  });

  it('throws when webrtc config is missing', () => {
    const config = {
      mode: 'ws-signaled', ws: baseWs, phases: [basePhase], outputDir: './out',
    } as TestConfig;
    expect(() => validateConfig(config)).toThrow('webrtc config is required');
  });

  it('throws when ws.serverUrl is missing', () => {
    const config: TestConfig = {
      mode: 'ws-signaled',
      ws: { ...baseWs, serverUrl: '' },
      webrtc: baseWrtc,
      phases: [basePhase],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).toThrow('ws.serverUrl is required');
  });

  it('throws when ws.accountPrefix is missing', () => {
    const config: TestConfig = {
      mode: 'ws-signaled',
      ws: { ...baseWs, accountPrefix: '' },
      webrtc: baseWrtc,
      phases: [basePhase],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).toThrow('ws.accountPrefix is required');
  });

  it('throws when ws.password is missing', () => {
    const config: TestConfig = {
      mode: 'ws-signaled',
      ws: { ...baseWs, password: '' },
      webrtc: baseWrtc,
      phases: [basePhase],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).toThrow('ws.password is required');
  });

  it('throws when ws.iperfTargetIp is missing', () => {
    const config: TestConfig = {
      mode: 'ws-signaled',
      ws: { ...baseWs, iperfTargetIp: '' },
      webrtc: baseWrtc,
      phases: [basePhase],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).toThrow('ws.iperfTargetIp is required');
  });

  it('throws when peerCount is odd in pair mode (no phoneUserId)', () => {
    const config: TestConfig = {
      mode: 'ws-signaled',
      ws: baseWs,
      webrtc: baseWrtc,
      phases: [{ peerCount: 3, msgPerSec: 5, durationSec: 10 }],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).toThrow('peerCount must be even');
  });

  it('allows odd peerCount in star mode (phoneUserId set)', () => {
    const config: TestConfig = {
      mode: 'ws-signaled',
      ws: { ...baseWs, phoneUserId: 'phone-user-id' },
      webrtc: baseWrtc,
      phases: [{ peerCount: 3, msgPerSec: 5, durationSec: 10 }],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('allows odd peerCount in ws star mode when mdnsDiscovery is set', () => {
    const config: TestConfig = {
      mode: 'ws-signaled',
      ws: { ...baseWs, mdnsDiscovery: true },
      webrtc: baseWrtc,
      phases: [{ peerCount: 3, msgPerSec: 5, durationSec: 10 }],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('passes with valid ws-signaled config', () => {
    const config: TestConfig = {
      mode: 'ws-signaled',
      ws: baseWs,
      webrtc: baseWrtc,
      phases: [basePhase],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('reports all missing ws fields at once', () => {
    const config: TestConfig = {
      mode: 'ws-signaled',
      ws: { serverUrl: '', accountPrefix: '', password: '', iperfTargetIp: '' },
      webrtc: baseWrtc,
      phases: [basePhase],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).toThrow('4 issue(s)');
  });
});
