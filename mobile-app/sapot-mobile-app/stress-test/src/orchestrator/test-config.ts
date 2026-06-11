export interface Phase {
  peerCount: number;
  msgPerSec: number;
  durationSec: number;
}

export interface LanConfig {
  hostIp: string;
  startPort: number;
}

export interface WsConfig {
  serverUrl: string;
  accountPrefix: string;
}

export interface TestConfig {
  mode: 'lan' | 'ws' | 'both';
  lan?: LanConfig;
  ws?: WsConfig;
  phases: Phase[];
  outputDir: string;
}

export function validateConfig(config: TestConfig): void {
  if ((config.mode === 'lan' || config.mode === 'both') && !config.lan)
    throw new Error('lan config required for mode lan/both');
  if ((config.mode === 'ws' || config.mode === 'both') && !config.ws)
    throw new Error('ws config required for mode ws/both');
  if (config.phases.length === 0) throw new Error('at least one phase required');
  for (const p of config.phases) {
    if (p.peerCount < 1) throw new Error('peerCount must be >= 1');
    if (p.msgPerSec < 1) throw new Error('msgPerSec must be >= 1');
    if (p.durationSec < 5) throw new Error('durationSec must be >= 5');
  }
}
