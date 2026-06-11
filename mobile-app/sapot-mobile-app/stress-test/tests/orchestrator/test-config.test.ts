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
