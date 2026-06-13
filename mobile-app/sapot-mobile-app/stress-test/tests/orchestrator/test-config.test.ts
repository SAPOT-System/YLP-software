import { validateConfig, TestConfig } from '@/orchestrator/test-config';

const basePhase = { peerCount: 2, msgPerSec: 5, durationSec: 10 };

describe('validateConfig — webrtc mode', () => {
  it('throws when mode is webrtc but webrtc config is missing', () => {
    const config = { mode: 'webrtc', phases: [basePhase], outputDir: './out' } as TestConfig;
    expect(() => validateConfig(config)).toThrow('webrtc config required');
  });

  it('throws when peerCount is odd in webrtc mode', () => {
    const config: TestConfig = {
      mode: 'webrtc',
      webrtc: { connectionTimeoutMs: 5000 },
      phases: [{ peerCount: 3, msgPerSec: 5, durationSec: 10 }],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).toThrow('peerCount must be even');
  });

  it('passes with valid webrtc config and even peerCount', () => {
    const config: TestConfig = {
      mode: 'webrtc',
      webrtc: { connectionTimeoutMs: 5000 },
      phases: [basePhase],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('passes webrtc config with optional media field', () => {
    const config: TestConfig = {
      mode: 'webrtc',
      webrtc: { connectionTimeoutMs: 5000, media: { type: 'audio', bitrate: 32 } },
      phases: [basePhase],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).not.toThrow();
  });
});

const baseLan = { hostIp: '127.0.0.1', startPort: 9100 };
const baseWs = { serverUrl: 'https://x', accountPrefix: 'p_', password: 'pw', iperfTargetIp: '' };
const baseWrtc = { connectionTimeoutMs: 5000 };

describe('validateConfig — tcp-signaled mode', () => {
  it('throws when lan config is missing', () => {
    const config = {
      mode: 'tcp-signaled', webrtc: baseWrtc, phases: [basePhase], outputDir: './out',
    } as TestConfig;
    expect(() => validateConfig(config)).toThrow('lan config required for mode tcp-signaled');
  });

  it('throws when webrtc config is missing', () => {
    const config = {
      mode: 'tcp-signaled', lan: baseLan, phases: [basePhase], outputDir: './out',
    } as TestConfig;
    expect(() => validateConfig(config)).toThrow('webrtc config required for mode tcp-signaled');
  });

  it('throws when peerCount is odd', () => {
    const config: TestConfig = {
      mode: 'tcp-signaled',
      lan: baseLan,
      webrtc: baseWrtc,
      phases: [{ peerCount: 3, msgPerSec: 5, durationSec: 10 }],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).toThrow('peerCount must be even');
  });

  it('passes with valid tcp-signaled config', () => {
    const config: TestConfig = {
      mode: 'tcp-signaled',
      lan: baseLan,
      webrtc: baseWrtc,
      phases: [basePhase],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).not.toThrow();
  });
});

describe('validateConfig — tcp-signaled star mode (adb discovery)', () => {
  it('passes when adbDiscovery is true and phone fields are absent', () => {
    const config: TestConfig = {
      mode: 'tcp-signaled',
      lan: { hostIp: '192.168.1.23', startPort: 9200, adbDiscovery: true },
      webrtc: baseWrtc,
      phases: [{ peerCount: 1, msgPerSec: 5, durationSec: 10 }],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('still throws when phoneIp is set without phonePort even with adbDiscovery absent', () => {
    const config: TestConfig = {
      mode: 'tcp-signaled',
      lan: { hostIp: '127.0.0.1', startPort: 9200, phoneIp: '192.168.1.5' },
      webrtc: baseWrtc,
      phases: [basePhase],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).toThrow('phonePort required');
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
    expect(() => validateConfig(config)).toThrow('ws config required for mode ws-signaled');
  });

  it('throws when webrtc config is missing', () => {
    const config = {
      mode: 'ws-signaled', ws: baseWs, phases: [basePhase], outputDir: './out',
    } as TestConfig;
    expect(() => validateConfig(config)).toThrow('webrtc config required for mode ws-signaled');
  });

  it('throws when peerCount is odd', () => {
    const config: TestConfig = {
      mode: 'ws-signaled',
      ws: baseWs,
      webrtc: baseWrtc,
      phases: [{ peerCount: 3, msgPerSec: 5, durationSec: 10 }],
      outputDir: './out',
    };
    expect(() => validateConfig(config)).toThrow('peerCount must be even');
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
});
