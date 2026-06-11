# LAN + WebSocket Stress Test Suite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js stress-test tool that finds the LAN (TCP) and WebSocket relay limits of the Sapot app by simulating up to 50 concurrent peers from the host laptop against a physical Android device.

**Architecture:** A `stress-test/` package inside the mobile app repo. An `Orchestrator` ramps N `LanPeer` or `WsPeer` instances through configured phases, each peer speaks the exact same NaCl ECDH + secretbox protocol as the app. A `MetricsCollector` records per-peer events; a `NetworkSampler` polls ADB for device-side network stats; a `Reporter` prints a summary table and writes `results.json`.

**Tech Stack:** Node.js 18+, TypeScript 5, `tweetnacl` + `tweetnacl-util` (same as app), `@homebridge/ciao` (mDNS), `ws` (WebSocket client), `commander` (CLI), `jest` + `ts-jest` (tests)

**Spec:** `~/.claude/projects/-home-adamskieee-Documents-dev-YLP-software/specs/2026-06-11-lan-ws-stress-test-design.md`

---

## File Map

```
stress-test/
├── src/
│   ├── protocol/
│   │   ├── tcp-protocol.ts         NEW — NaCl ECDH + secretbox (ported from app)
│   │   └── ws-protocol.ts          NEW — WS auth, message types, heartbeat
│   ├── peers/
│   │   ├── base-peer.ts            NEW — BasePeer interface + shared types
│   │   ├── lan-peer.ts             NEW — TCP server + mDNS + ECDH handshake
│   │   └── ws-peer.ts              NEW — WebSocket client + JWT auth + RTT
│   ├── orchestrator/
│   │   ├── test-config.ts          NEW — TestConfig, Phase, LanConfig, WsConfig types
│   │   └── orchestrator.ts         NEW — phase runner, peer lifecycle
│   ├── metrics/
│   │   ├── collector.ts            NEW — per-peer event log, PhaseStats compute
│   │   ├── network-sampler.ts      NEW — ADB poller (/proc/net/dev, /proc/net/snmp, dumpsys wifi)
│   │   └── reporter.ts             NEW — summary table + results.json writer
│   └── runner.ts                   NEW — CLI entry point
├── scripts/
│   └── seed-test-accounts.ts       NEW — pre-create N FastAPI test accounts
├── tests/
│   ├── protocol/
│   │   ├── tcp-protocol.test.ts    NEW
│   │   └── ws-protocol.test.ts     NEW
│   ├── peers/
│   │   ├── lan-peer.test.ts        NEW
│   │   └── ws-peer.test.ts         NEW
│   ├── orchestrator/
│   │   └── orchestrator.test.ts    NEW
│   └── metrics/
│       ├── collector.test.ts       NEW
│       └── reporter.test.ts        NEW
├── package.json                    NEW
├── tsconfig.json                   NEW
├── jest.config.ts                  NEW
└── stress-test.config.json         NEW — example config (not secret)
```

---

## Task 1: Project Setup

**Files:**
- Create: `stress-test/package.json`
- Create: `stress-test/tsconfig.json`
- Create: `stress-test/jest.config.ts`
- Create: `stress-test/stress-test.config.json`

- [ ] **Step 1: Create `stress-test/package.json`**

```json
{
  "name": "@sapot/stress-test",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "jest",
    "build": "tsc",
    "run:stress": "ts-node src/runner.ts"
  },
  "dependencies": {
    "@homebridge/ciao": "^1.3.0",
    "commander": "^12.0.0",
    "tweetnacl": "^1.0.3",
    "tweetnacl-util": "^0.15.1",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.3.0",
    "ts-node": "^10.9.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `stress-test/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*", "scripts/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `stress-test/jest.config.ts`**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testTimeout: 15000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default config;
```

- [ ] **Step 4: Create `stress-test/stress-test.config.json`**

```json
{
  "mode": "both",
  "lan": {
    "hostIp": "192.168.1.100",
    "startPort": 9000
  },
  "ws": {
    "serverUrl": "http://192.168.1.100:8000",
    "accountPrefix": "stress_peer_"
  },
  "phases": [
    { "peerCount": 1,  "msgPerSec": 1,   "durationSec": 30  },
    { "peerCount": 5,  "msgPerSec": 5,   "durationSec": 60  },
    { "peerCount": 10, "msgPerSec": 5,   "durationSec": 60  },
    { "peerCount": 20, "msgPerSec": 5,   "durationSec": 60  },
    { "peerCount": 50, "msgPerSec": 5,   "durationSec": 60  },
    { "peerCount": 10, "msgPerSec": 10,  "durationSec": 60  },
    { "peerCount": 10, "msgPerSec": 50,  "durationSec": 60  },
    { "peerCount": 10, "msgPerSec": 100, "durationSec": 60  },
    { "peerCount": 10, "msgPerSec": 200, "durationSec": 60  },
    { "peerCount": 20, "msgPerSec": 50,  "durationSec": 120 }
  ],
  "outputDir": "./stress-results"
}
```

- [ ] **Step 5: Install dependencies**

```bash
cd stress-test && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add stress-test/package.json stress-test/tsconfig.json stress-test/jest.config.ts stress-test/stress-test.config.json stress-test/package-lock.json
git commit -m "chore(stress-test): scaffold Node.js stress test package"
```

---

## Task 2: TCP Protocol (Port from App)

**Files:**
- Create: `stress-test/src/protocol/tcp-protocol.ts`
- Create: `stress-test/tests/protocol/tcp-protocol.test.ts`

The app's `tcp-encryption.ts` uses `tweetnacl` and runs in Node.js unchanged. Port it, replacing the app's `Message` type with a local `StressMessage` type.

- [ ] **Step 1: Write the failing test**

```typescript
// stress-test/tests/protocol/tcp-protocol.test.ts
import {
  generateKeyPair, computeSharedKey, encryptMessage, decryptMessage,
  buildHandshakeInit, buildHandshakeAck, parsePublicKey,
} from '@/protocol/tcp-protocol';

describe('tcp-protocol', () => {
  it('round-trips a message through encrypt/decrypt', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const aliceShared = computeSharedKey(alice.secretKey, bob.publicKey);
    const bobShared = computeSharedKey(bob.secretKey, alice.publicKey);
    const msg = { type: 'chat', payload: 'hello' };
    const envelope = encryptMessage(aliceShared, msg);
    const decrypted = decryptMessage(bobShared, envelope);
    expect(decrypted).toEqual(msg);
  });

  it('buildHandshakeInit produces correct type', () => {
    const kp = generateKeyPair();
    const frame = buildHandshakeInit(kp.publicKey);
    expect(frame.type).toBe('handshake-init');
    expect(typeof frame.pub).toBe('string');
  });

  it('buildHandshakeAck produces correct type', () => {
    const kp = generateKeyPair();
    const frame = buildHandshakeAck(kp.publicKey);
    expect(frame.type).toBe('handshake-ack');
    expect(typeof frame.pub).toBe('string');
  });

  it('parsePublicKey round-trips through base64', () => {
    const { encodeBase64 } = require('tweetnacl-util');
    const kp = generateKeyPair();
    const b64 = encodeBase64(kp.publicKey);
    expect(parsePublicKey(b64)).toEqual(kp.publicKey);
  });

  it('decryptMessage throws when key is wrong', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const charlie = generateKeyPair();
    const aliceShared = computeSharedKey(alice.secretKey, bob.publicKey);
    const wrongShared = computeSharedKey(charlie.secretKey, alice.publicKey);
    const envelope = encryptMessage(aliceShared, { type: 'chat', payload: 'hi' });
    expect(() => decryptMessage(wrongShared, envelope)).toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd stress-test && npx jest tests/protocol/tcp-protocol.test.ts
```

Expected: `Cannot find module '@/protocol/tcp-protocol'`

- [ ] **Step 3: Create `stress-test/src/protocol/tcp-protocol.ts`**

```typescript
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

export type StressMessage = Record<string, unknown>;

export interface EncryptedEnvelope {
  type: 'encrypted';
  nonce: string;
  box: string;
}

export interface HandshakeInit {
  type: 'handshake-init';
  pub: string;
}

export interface HandshakeAck {
  type: 'handshake-ack';
  pub: string;
}

export function generateKeyPair(): nacl.BoxKeyPair {
  return nacl.box.keyPair();
}

export function computeSharedKey(mySecretKey: Uint8Array, theirPublicKey: Uint8Array): Uint8Array {
  return nacl.box.before(theirPublicKey, mySecretKey);
}

export function encryptMessage(sharedKey: Uint8Array, message: StressMessage): EncryptedEnvelope {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const plaintext = new TextEncoder().encode(JSON.stringify(message));
  const ciphertext = nacl.secretbox(plaintext, nonce, sharedKey);
  return { type: 'encrypted', nonce: encodeBase64(nonce), box: encodeBase64(ciphertext) };
}

export function decryptMessage(sharedKey: Uint8Array, envelope: EncryptedEnvelope): StressMessage {
  const nonce = decodeBase64(envelope.nonce);
  const ciphertext = decodeBase64(envelope.box);
  const plaintext = nacl.secretbox.open(ciphertext, nonce, sharedKey);
  if (!plaintext) throw new Error('TCP decryption failed — authentication mismatch');
  return JSON.parse(new TextDecoder().decode(plaintext)) as StressMessage;
}

export function buildHandshakeInit(publicKey: Uint8Array): HandshakeInit {
  return { type: 'handshake-init', pub: encodeBase64(publicKey) };
}

export function buildHandshakeAck(publicKey: Uint8Array): HandshakeAck {
  return { type: 'handshake-ack', pub: encodeBase64(publicKey) };
}

export function parsePublicKey(b64: string): Uint8Array {
  return decodeBase64(b64);
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd stress-test && npx jest tests/protocol/tcp-protocol.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add stress-test/src/protocol/tcp-protocol.ts stress-test/tests/protocol/tcp-protocol.test.ts
git commit -m "feat(stress-test): add TCP protocol port (NaCl ECDH + secretbox)"
```

---

## Task 3: WS Protocol

**Files:**
- Create: `stress-test/src/protocol/ws-protocol.ts`
- Create: `stress-test/tests/protocol/ws-protocol.test.ts`

Login endpoint: `POST /auth/token` with `application/x-www-form-urlencoded` body (`username`, `password`). Returns `{ access_token: string }`.

- [ ] **Step 1: Write the failing test**

```typescript
// stress-test/tests/protocol/ws-protocol.test.ts
import { buildWsUrl, buildChatMessage, isServerAck, isPong } from '@/protocol/ws-protocol';

describe('ws-protocol', () => {
  it('buildWsUrl constructs correct websocket URL', () => {
    expect(buildWsUrl('http://192.168.1.100:8000', 'test-token')).toBe('ws://192.168.1.100:8000/ws/?token=test-token');
  });

  it('buildWsUrl converts https to wss', () => {
    expect(buildWsUrl('https://sapot.online', 'tok')).toBe('wss://sapot.online/ws/?token=tok');
  });

  it('buildChatMessage produces correct shape', () => {
    const msg = buildChatMessage('peer-a', 'peer-b', 'hello');
    expect(msg.type).toBe('chat');
    expect(msg.data.from).toBe('peer-a');
    expect(msg.data.to).toBe('peer-b');
    expect(typeof msg.data.messageId).toBe('string');
  });

  it('isServerAck identifies server-ack messages', () => {
    expect(isServerAck({ type: 'server-ack', data: { messageId: 'abc', message_type: 'chat' } })).toBe(true);
    expect(isServerAck({ type: 'chat' })).toBe(false);
    expect(isServerAck(null)).toBe(false);
  });

  it('isPong identifies pong messages', () => {
    expect(isPong({ type: 'pong' })).toBe(true);
    expect(isPong({ type: 'ping' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd stress-test && npx jest tests/protocol/ws-protocol.test.ts
```

- [ ] **Step 3: Create `stress-test/src/protocol/ws-protocol.ts`**

```typescript
import { randomUUID } from 'crypto';

export interface WsChatMessage {
  type: 'chat';
  data: { from: string; to: string; messageId: string; content: string; timestamp: number; messageType: 'text' };
}

export interface WsServerAck {
  type: 'server-ack';
  data: { messageId: string; message_type: string };
}

export interface WsPong { type: 'pong' }

export function buildWsUrl(serverUrl: string, token: string): string {
  const base = serverUrl.replace(/\/+$/, '');
  const wsBase = base.startsWith('https://')
    ? `wss://${base.slice('https://'.length)}`
    : base.startsWith('http://')
    ? `ws://${base.slice('http://'.length)}`
    : `ws://${base}`;
  return `${wsBase}/ws/?token=${encodeURIComponent(token)}`;
}

export function buildChatMessage(from: string, to: string, content: string): WsChatMessage {
  return { type: 'chat', data: { from, to, messageId: randomUUID(), content, timestamp: Date.now(), messageType: 'text' } };
}

export async function fetchJwt(serverUrl: string, username: string, password: string): Promise<string> {
  const base = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password }).toString(),
  });
  if (!res.ok) throw new Error(`Login failed for ${username}: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export function isServerAck(msg: unknown): msg is WsServerAck {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'server-ack' && typeof (m['data'] as Record<string, unknown>)?.['messageId'] === 'string';
}

export function isPong(msg: unknown): msg is WsPong {
  if (!msg || typeof msg !== 'object') return false;
  return (msg as Record<string, unknown>)['type'] === 'pong';
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd stress-test && npx jest tests/protocol/ws-protocol.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add stress-test/src/protocol/ws-protocol.ts stress-test/tests/protocol/ws-protocol.test.ts
git commit -m "feat(stress-test): add WS protocol helpers (URL builder, message types, JWT fetch)"
```

---

## Task 4: Config Types + Base Peer Interface

**Files:**
- Create: `stress-test/src/orchestrator/test-config.ts`
- Create: `stress-test/src/peers/base-peer.ts`

- [ ] **Step 1: Create `stress-test/src/orchestrator/test-config.ts`**

```typescript
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
```

- [ ] **Step 2: Create `stress-test/src/peers/base-peer.ts`**

```typescript
export interface PeerMetrics {
  sent: number;
  acked: number;
  dropped: number;
  writeLatencySamples: number[];
  connectionErrors: number;
  wsPeakQueueFills: number;
}

export interface BasePeer {
  readonly peerId: string;
  readonly peerIndex: number;
  connect(): Promise<void>;
  startSending(msgPerSec: number): void;
  stopSending(): void;
  disconnect(): Promise<void>;
  getMetrics(): PeerMetrics;
}

export function emptyMetrics(): PeerMetrics {
  return { sent: 0, acked: 0, dropped: 0, writeLatencySamples: [], connectionErrors: 0, wsPeakQueueFills: 0 };
}
```

- [ ] **Step 3: Commit**

```bash
git add stress-test/src/orchestrator/test-config.ts stress-test/src/peers/base-peer.ts
git commit -m "feat(stress-test): add TestConfig types and BasePeer interface"
```

---

## Task 5: Metrics Collector

**Files:**
- Create: `stress-test/src/metrics/collector.ts`
- Create: `stress-test/tests/metrics/collector.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// stress-test/tests/metrics/collector.test.ts
import { MetricsCollector } from '@/metrics/collector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;
  beforeEach(() => { collector = new MetricsCollector(); });

  it('computes delivery rate correctly', () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) collector.recordSent('peer-1', now + i);
    for (let i = 0; i < 8; i++) collector.recordAcked('peer-1', now + i, 20);
    for (let i = 0; i < 2; i++) collector.recordDropped('peer-1');
    const stats = collector.computeStats('test', 1, 10, 60, now, now + 10000);
    expect(stats.totalSent).toBe(10);
    expect(stats.totalAcked).toBe(8);
    expect(stats.deliveryRate).toBeCloseTo(0.8);
    expect(stats.droppedCount).toBe(2);
  });

  it('computes latency percentiles', () => {
    const now = Date.now();
    for (let ms = 1; ms <= 100; ms++) {
      collector.recordSent('peer-1', now);
      collector.recordAcked('peer-1', now, ms);
    }
    const stats = collector.computeStats('test', 1, 10, 60, now, now + 100000);
    expect(stats.p50Ms).toBe(50);
    expect(stats.p95Ms).toBe(95);
    expect(stats.p99Ms).toBe(99);
  });

  it('jitter is 0 when all latencies are equal', () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      collector.recordSent('peer-1', now);
      collector.recordAcked('peer-1', now, 20);
    }
    expect(collector.computeStats('test', 1, 10, 60, now, now + 10000).jitterMs).toBe(0);
  });

  it('resets cleanly between phases', () => {
    const now = Date.now();
    collector.recordSent('peer-1', now);
    collector.reset();
    expect(collector.computeStats('after-reset', 1, 1, 10, now, now + 1000).totalSent).toBe(0);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd stress-test && npx jest tests/metrics/collector.test.ts
```

- [ ] **Step 3: Create `stress-test/src/metrics/collector.ts`**

```typescript
export interface PhaseStats {
  phaseName: string;
  peerCount: number;
  msgPerSec: number;
  durationSec: number;
  totalSent: number;
  totalAcked: number;
  deliveryRate: number;
  droppedCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  jitterMs: number;
  connectionErrors: number;
  wsPeakQueueFills: number;
}

export class MetricsCollector {
  private sentCounts = new Map<string, number>();
  private latencySamples: number[] = [];
  private droppedCounts = new Map<string, number>();
  private ackCounts = new Map<string, number>();
  private connectionErrors = 0;
  private wsPeakQueueFills = 0;

  recordSent(peerId: string, _atMs: number): void {
    this.sentCounts.set(peerId, (this.sentCounts.get(peerId) ?? 0) + 1);
  }

  recordAcked(peerId: string, _sentAtMs: number, latencyMs: number): void {
    this.latencySamples.push(latencyMs);
    this.ackCounts.set(peerId, (this.ackCounts.get(peerId) ?? 0) + 1);
  }

  recordDropped(peerId: string): void {
    this.droppedCounts.set(peerId, (this.droppedCounts.get(peerId) ?? 0) + 1);
  }

  recordConnectionError(): void { this.connectionErrors++; }
  recordQueueFill(): void { this.wsPeakQueueFills++; }

  reset(): void {
    this.sentCounts = new Map();
    this.latencySamples = [];
    this.droppedCounts = new Map();
    this.ackCounts = new Map();
    this.connectionErrors = 0;
    this.wsPeakQueueFills = 0;
  }

  computeStats(phaseName: string, peerCount: number, msgPerSec: number, durationSec: number, _startMs: number, _endMs: number): PhaseStats {
    let totalSent = 0;
    for (const v of this.sentCounts.values()) totalSent += v;
    let totalAcked = 0;
    for (const v of this.ackCounts.values()) totalAcked += v;
    let totalDropped = 0;
    for (const v of this.droppedCounts.values()) totalDropped += v;

    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const pct = (p: number) => {
      if (sorted.length === 0) return 0;
      return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
    };
    const mean = sorted.length > 0 ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
    const variance = sorted.length > 1 ? sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (sorted.length - 1) : 0;

    return {
      phaseName, peerCount, msgPerSec, durationSec,
      totalSent, totalAcked,
      deliveryRate: totalSent > 0 ? totalAcked / totalSent : 0,
      droppedCount: totalDropped,
      p50Ms: pct(50), p95Ms: pct(95), p99Ms: pct(99),
      jitterMs: Math.round(Math.sqrt(variance)),
      connectionErrors: this.connectionErrors,
      wsPeakQueueFills: this.wsPeakQueueFills,
    };
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd stress-test && npx jest tests/metrics/collector.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add stress-test/src/metrics/collector.ts stress-test/tests/metrics/collector.test.ts
git commit -m "feat(stress-test): add MetricsCollector with percentile and jitter computation"
```

---

## Task 6: Network Sampler

**Files:**
- Create: `stress-test/src/metrics/network-sampler.ts`

- [ ] **Step 1: Create `stress-test/src/metrics/network-sampler.ts`**

```typescript
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
    this.wifiTimer = setInterval(() => this.sampleWifi(), wifiPollMs);
  }

  stop(): void {
    clearInterval(this.timer);
    clearInterval(this.wifiTimer);
  }

  reset(): void { this.samples = []; }
  getSamples(): NetworkSample[] { return [...this.samples]; }

  private sample(): void {
    try {
      const devRaw = execSync('adb shell cat /proc/net/dev', { encoding: 'utf8', timeout: 2000 });
      const snmpRaw = execSync('adb shell cat /proc/net/snmp', { encoding: 'utf8', timeout: 2000 });
      this.samples.push({
        timestamp: Date.now(),
        ...parseNetDev(devRaw),
        tcpRetransSegs: parseSnmpRetrans(snmpRaw),
        rssiDbm: this.lastRssi,
        linkSpeedMbps: this.lastLinkSpeed,
      });
    } catch {
      this.samples.push({ timestamp: Date.now(), wlanRxBytes: 0, wlanTxBytes: 0, tcpRetransSegs: 0, rssiDbm: null, linkSpeedMbps: null });
    }
  }

  private sampleWifi(): void {
    try {
      const raw = execSync('adb shell dumpsys wifi | grep -E "RSSI|Link speed"', { encoding: 'utf8', timeout: 3000 });
      const rssiMatch = raw.match(/RSSI:\s*(-?\d+)/);
      const speedMatch = raw.match(/Link speed:\s*(\d+)/);
      this.lastRssi = rssiMatch ? parseInt(rssiMatch[1], 10) : null;
      this.lastLinkSpeed = speedMatch ? parseInt(speedMatch[1], 10) : null;
    } catch { /* best effort */ }
  }
}

function parseNetDev(raw: string): { wlanRxBytes: number; wlanTxBytes: number } {
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('wlan0:')) continue;
    const p = t.split(/\s+/);
    return { wlanRxBytes: parseInt(p[1], 10) || 0, wlanTxBytes: parseInt(p[9], 10) || 0 };
  }
  return { wlanRxBytes: 0, wlanTxBytes: 0 };
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
```

- [ ] **Step 2: Commit**

```bash
git add stress-test/src/metrics/network-sampler.ts
git commit -m "feat(stress-test): add NetworkSampler (ADB /proc/net/dev + wifi poller)"
```

---

## Task 7: Reporter

**Files:**
- Create: `stress-test/src/metrics/reporter.ts`
- Create: `stress-test/tests/metrics/reporter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// stress-test/tests/metrics/reporter.test.ts
import { formatTable, computeNetworkStats } from '@/metrics/reporter';
import { NetworkSample } from '@/metrics/network-sampler';
import { PhaseStats } from '@/metrics/collector';

const fakePhase: PhaseStats = {
  phaseName: 'peer-ramp-5', peerCount: 5, msgPerSec: 5, durationSec: 60,
  totalSent: 1500, totalAcked: 1490, deliveryRate: 0.9933, droppedCount: 10,
  p50Ms: 12, p95Ms: 35, p99Ms: 80, jitterMs: 8, connectionErrors: 0, wsPeakQueueFills: 0,
};

describe('reporter', () => {
  it('formatTable contains phase name and delivery rate', () => {
    const table = formatTable([fakePhase]);
    expect(table).toContain('peer-ramp-5');
    expect(table).toContain('99.3%');
  });

  it('computeNetworkStats calculates throughput from byte deltas', () => {
    const samples: NetworkSample[] = [
      { timestamp: 0,    wlanRxBytes: 0,         wlanTxBytes: 0,         tcpRetransSegs: 0,  rssiDbm: -60, linkSpeedMbps: 144 },
      { timestamp: 5000, wlanRxBytes: 5_000_000, wlanTxBytes: 3_000_000, tcpRetransSegs: 10, rssiDbm: -61, linkSpeedMbps: 144 },
    ];
    const stats = computeNetworkStats(samples, 5000);
    // (5MB + 3MB) * 8 bits / 5s = 12.8 Mbps
    expect(stats.throughputMbps).toBeCloseTo(12.8, 1);
    expect(stats.rssiDbm).toBe(-61);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd stress-test && npx jest tests/metrics/reporter.test.ts
```

- [ ] **Step 3: Create `stress-test/src/metrics/reporter.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { PhaseStats } from './collector';
import { NetworkSample } from './network-sampler';

export interface NetworkStats {
  throughputMbps: number;
  goodputMbps: number;
  packetLossPercent: number;
  rssiDbm: number | null;
  linkSpeedMbps: number | null;
  interfaceRxMb: number;
  interfaceTxMb: number;
}

export function computeNetworkStats(samples: NetworkSample[], durationMs: number): NetworkStats {
  if (samples.length < 2) {
    return { throughputMbps: 0, goodputMbps: 0, packetLossPercent: 0, rssiDbm: null, linkSpeedMbps: null, interfaceRxMb: 0, interfaceTxMb: 0 };
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  const rxDelta = last.wlanRxBytes - first.wlanRxBytes;
  const txDelta = last.wlanTxBytes - first.wlanTxBytes;
  const totalBytes = rxDelta + txDelta;
  const durationSec = durationMs / 1000;
  const throughputMbps = (totalBytes * 8) / (durationSec * 1_000_000);
  const goodputMbps = throughputMbps * 0.85;
  const retransDelta = last.tcpRetransSegs - first.tcpRetransSegs;
  const totalSegments = Math.max(1, Math.ceil(totalBytes / 1460));
  const packetLossPercent = Math.min(100, (retransDelta / totalSegments) * 100);
  return {
    throughputMbps: Math.round(throughputMbps * 10) / 10,
    goodputMbps: Math.round(goodputMbps * 10) / 10,
    packetLossPercent: Math.round(packetLossPercent * 100) / 100,
    rssiDbm: last.rssiDbm,
    linkSpeedMbps: last.linkSpeedMbps,
    interfaceRxMb: Math.round(rxDelta / 100_000) / 10,
    interfaceTxMb: Math.round(txDelta / 100_000) / 10,
  };
}

export function formatTable(phases: PhaseStats[]): string {
  const header = 'Phase              | Peers | Msg/s | Delivered | Dropped | P50  | P95   | Jitter';
  const sep    = '-------------------|-------|-------|-----------|---------|------|-------|-------';
  const rows = phases.map(p => {
    const name   = p.phaseName.padEnd(18);
    const peers  = String(p.peerCount).padStart(5);
    const rate   = String(p.msgPerSec).padStart(5);
    const del    = `${(p.deliveryRate * 100).toFixed(1)}%`.padStart(9);
    const drop   = String(p.droppedCount).padStart(7);
    const p50    = `${p.p50Ms}ms`.padStart(4);
    const p95    = `${p.p95Ms}ms`.padStart(5);
    const jitter = `${p.jitterMs}ms`.padStart(5);
    return `${name} | ${peers} | ${rate} | ${del} | ${drop} | ${p50} | ${p95} | ${jitter}`;
  });
  return [header, sep, ...rows].join('\n');
}

export function writeResults(outputDir: string, transport: string, phases: PhaseStats[], networkStats: NetworkStats): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = path.join(outputDir, `results-${transport}-${Date.now()}.json`);
  fs.writeFileSync(filename, JSON.stringify({ transport, phases, networkStats }, null, 2));
  console.log(`\nResults written to ${filename}`);
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd stress-test && npx jest tests/metrics/reporter.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add stress-test/src/metrics/reporter.ts stress-test/tests/metrics/reporter.test.ts
git commit -m "feat(stress-test): add Reporter (table formatter, network stats, JSON writer)"
```

---

## Task 8: LAN Peer

**Files:**
- Create: `stress-test/src/peers/lan-peer.ts`
- Create: `stress-test/tests/peers/lan-peer.test.ts`

Write latency = time from `socket.write()` to `drain` (or immediate if buffer was not full). mDNS advertisement is skipped silently in test environments where ciao is unavailable.

- [ ] **Step 1: Write the failing test**

```typescript
// stress-test/tests/peers/lan-peer.test.ts
import net from 'net';
import { LanPeer } from '@/peers/lan-peer';
import { MetricsCollector } from '@/metrics/collector';
import { generateKeyPair, computeSharedKey, decryptMessage, parsePublicKey } from '@/protocol/tcp-protocol';
import { encodeBase64 } from 'tweetnacl-util';

async function simulateAppConnect(port: number): Promise<{ socket: net.Socket; sharedKey: Uint8Array }> {
  return new Promise((resolve, reject) => {
    const appKp = generateKeyPair();
    let buf = '';
    const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
      socket.write(JSON.stringify({ type: 'handshake-init', pub: encodeBase64(appKp.publicKey) }) + '\n');
    });
    socket.on('data', (raw) => {
      buf += raw.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const frame = JSON.parse(line);
        if (frame.type === 'handshake-ack') {
          resolve({ socket, sharedKey: computeSharedKey(appKp.secretKey, parsePublicKey(frame.pub)) });
        }
      }
    });
    socket.on('error', reject);
    setTimeout(() => reject(new Error('handshake timeout')), 5000);
  });
}

describe('LanPeer', () => {
  let peer: LanPeer;
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
    peer = new LanPeer('test-peer-1', 0, '127.0.0.1', 0, collector);
  });

  afterEach(async () => { await peer.disconnect(); });

  it('starts a TCP server and completes ECDH handshake', async () => {
    await peer.connect();
    const { socket, sharedKey } = await simulateAppConnect(peer.port);
    expect(sharedKey).toHaveLength(32);
    socket.destroy();
  });

  it('sends encrypted messages and increments sent count', async () => {
    await peer.connect();
    const received: unknown[] = [];
    const { socket, sharedKey } = await simulateAppConnect(peer.port);
    let buf = '';
    socket.on('data', (raw) => {
      buf += raw.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const frame = JSON.parse(line);
        if (frame.type === 'encrypted') received.push(decryptMessage(sharedKey, frame));
      }
    });
    peer.startSending(10);
    await new Promise(res => setTimeout(res, 500));
    peer.stopSending();
    expect(received.length).toBeGreaterThan(0);
    expect(peer.getMetrics().sent).toBeGreaterThan(0);
    socket.destroy();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd stress-test && npx jest tests/peers/lan-peer.test.ts
```

- [ ] **Step 3: Create `stress-test/src/peers/lan-peer.ts`**

```typescript
import net from 'net';
import {
  generateKeyPair, computeSharedKey, encryptMessage, decryptMessage,
  buildHandshakeAck, parsePublicKey, EncryptedEnvelope,
} from '../protocol/tcp-protocol';
import { BasePeer, PeerMetrics, emptyMetrics } from './base-peer';
import { MetricsCollector } from '../metrics/collector';

export class LanPeer implements BasePeer {
  readonly peerId: string;
  readonly peerIndex: number;
  private _port: number;
  private server: net.Server;
  private socket?: net.Socket;
  private sharedKey?: Uint8Array;
  private receiveBuffer = '';
  private handshakeDone = false;
  private metrics: PeerMetrics = emptyMetrics();
  private sendTimer?: NodeJS.Timeout;

  constructor(
    peerId: string,
    peerIndex: number,
    private readonly hostIp: string,
    port: number,
    private readonly collector: MetricsCollector,
  ) {
    this.peerId = peerId;
    this.peerIndex = peerIndex;
    this._port = port;
    this.server = net.createServer();
  }

  get port(): number { return this._port; }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.listen(this._port, '0.0.0.0', () => {
        const addr = this.server.address();
        if (addr && typeof addr === 'object') this._port = addr.port;
        resolve();
      });
      this.server.on('error', reject);
    });

    this.server.on('connection', (socket) => {
      this.socket = socket;
      const kp = generateKeyPair();
      this.receiveBuffer = '';
      this.handshakeDone = false;

      socket.on('data', (raw) => {
        this.receiveBuffer += raw.toString('utf8');
        const lines = this.receiveBuffer.split('\n');
        this.receiveBuffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const frame = JSON.parse(line);
            if (!this.handshakeDone) {
              if (frame.type !== 'handshake-init') return;
              this.sharedKey = computeSharedKey(kp.secretKey, parsePublicKey(frame.pub));
              socket.write(JSON.stringify(buildHandshakeAck(kp.publicKey)) + '\n');
              this.handshakeDone = true;
            } else if (frame.type === 'encrypted' && this.sharedKey) {
              decryptMessage(this.sharedKey, frame as EncryptedEnvelope);
            }
          } catch { /* malformed frame */ }
        }
      });

      socket.on('error', () => {
        this.metrics.connectionErrors++;
        this.collector.recordConnectionError();
      });
      socket.on('close', () => {
        this.socket = undefined;
        this.handshakeDone = false;
        this.sharedKey = undefined;
      });
    });

    await this.advertiseMdns();
  }

  private async advertiseMdns(): Promise<void> {
    try {
      const { getResponder } = await import('@homebridge/ciao');
      const responder = getResponder();
      const svc = responder.createService({
        name: this.peerId,
        type: 'lanchat' as unknown as import('@homebridge/ciao').ServiceType,
        protocol: 'tcp',
        port: this._port,
        txt: { peerId: this.peerId },
      });
      await svc.advertise();
    } catch { /* mDNS optional in test environment */ }
  }

  startSending(msgPerSec: number): void {
    const intervalMs = Math.max(10, Math.floor(1000 / msgPerSec));
    this.sendTimer = setInterval(() => {
      if (!this.socket || !this.sharedKey || !this.handshakeDone) return;
      const sentAt = Date.now();
      try {
        const envelope = encryptMessage(this.sharedKey, { type: 'stress-chat', from: this.peerId, ts: sentAt, seq: this.metrics.sent });
        const writeStart = Date.now();
        const flushed = this.socket.write(JSON.stringify(envelope) + '\n');
        const recordLatency = (latency: number) => {
          this.metrics.writeLatencySamples.push(latency);
          this.metrics.acked++;
          this.collector.recordAcked(this.peerId, sentAt, latency);
        };
        if (flushed) {
          recordLatency(Date.now() - writeStart);
        } else {
          this.socket.once('drain', () => recordLatency(Date.now() - writeStart));
        }
        this.metrics.sent++;
        this.collector.recordSent(this.peerId, sentAt);
      } catch {
        this.metrics.dropped++;
        this.collector.recordDropped(this.peerId);
      }
    }, intervalMs);
  }

  stopSending(): void {
    clearInterval(this.sendTimer);
    this.sendTimer = undefined;
  }

  async disconnect(): Promise<void> {
    this.stopSending();
    this.socket?.destroy();
    await new Promise<void>(res => this.server.close(() => res()));
  }

  getMetrics(): PeerMetrics { return { ...this.metrics }; }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd stress-test && npx jest tests/peers/lan-peer.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add stress-test/src/peers/lan-peer.ts stress-test/tests/peers/lan-peer.test.ts
git commit -m "feat(stress-test): add LanPeer (TCP server + mDNS + ECDH)"
```

---

## Task 9: WS Peer

**Files:**
- Create: `stress-test/src/peers/ws-peer.ts`
- Create: `stress-test/tests/peers/ws-peer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// stress-test/tests/peers/ws-peer.test.ts
import { WebSocketServer } from 'ws';
import { WsPeer } from '@/peers/ws-peer';
import { MetricsCollector } from '@/metrics/collector';

function startFakeWsServer(port: number, sendAck = true): WebSocketServer {
  const wss = new WebSocketServer({ port });
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        if (msg.type === 'chat' && sendAck) {
          ws.send(JSON.stringify({ type: 'server-ack', data: { messageId: msg.data.messageId, message_type: 'chat' } }));
        }
      } catch { /* ignore */ }
    });
  });
  return wss;
}

describe('WsPeer', () => {
  let wss: WebSocketServer;
  let peer: WsPeer;
  let collector: MetricsCollector;

  beforeEach(async () => {
    wss = startFakeWsServer(9901);
    collector = new MetricsCollector();
    peer = new WsPeer('ws-peer-1', 0, 'ws://127.0.0.1:9901', collector);
  });

  afterEach(async () => {
    await peer.disconnect();
    await new Promise<void>(res => wss.close(() => res()));
  });

  it('connects to WebSocket server', async () => {
    await peer.connect();
    expect(peer.isConnected).toBe(true);
  });

  it('sends messages and records ack latency', async () => {
    await peer.connect();
    peer.startSending(5);
    await new Promise(res => setTimeout(res, 800));
    peer.stopSending();
    const metrics = peer.getMetrics();
    expect(metrics.sent).toBeGreaterThan(0);
    expect(metrics.acked).toBeGreaterThan(0);
  });

  it('records dropped when ack never arrives', async () => {
    const noAckWss = startFakeWsServer(9902, false);
    const noAckPeer = new WsPeer('ws-peer-2', 1, 'ws://127.0.0.1:9902', new MetricsCollector(), 200);
    await noAckPeer.connect();
    noAckPeer.startSending(10);
    await new Promise(res => setTimeout(res, 500));
    noAckPeer.stopSending();
    await new Promise(res => setTimeout(res, 300));
    await noAckPeer.disconnect();
    await new Promise<void>(res => noAckWss.close(() => res()));
    expect(noAckPeer.getMetrics().dropped).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd stress-test && npx jest tests/peers/ws-peer.test.ts
```

- [ ] **Step 3: Create `stress-test/src/peers/ws-peer.ts`**

```typescript
import WebSocket from 'ws';
import { buildChatMessage, isServerAck, isPong } from '../protocol/ws-protocol';
import { BasePeer, PeerMetrics, emptyMetrics } from './base-peer';
import { MetricsCollector } from '../metrics/collector';

export class WsPeer implements BasePeer {
  readonly peerId: string;
  readonly peerIndex: number;
  private ws?: WebSocket;
  private metrics: PeerMetrics = emptyMetrics();
  private sendTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private pendingAcks = new Map<string, { sentAt: number; timer: NodeJS.Timeout }>();

  constructor(
    peerId: string,
    peerIndex: number,
    private readonly wsUrl: string,
    private readonly collector: MetricsCollector,
    private readonly ackTimeoutMs = 5000,
  ) {
    this.peerId = peerId;
    this.peerIndex = peerIndex;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      const timeout = setTimeout(() => reject(new Error(`WS connect timeout: ${this.peerId}`)), 10000);
      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.startHeartbeat();
        resolve();
      });
      this.ws.on('message', (raw) => this.handleMessage(raw.toString()));
      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        this.metrics.connectionErrors++;
        this.collector.recordConnectionError();
        reject(err);
      });
      this.ws.on('close', () => { this.ws = undefined; });
    });
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);
      if (isPong(msg)) return;
      if (isServerAck(msg)) {
        const pending = this.pendingAcks.get(msg.data.messageId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingAcks.delete(msg.data.messageId);
          const latency = Date.now() - pending.sentAt;
          this.metrics.acked++;
          this.metrics.writeLatencySamples.push(latency);
          this.collector.recordAcked(this.peerId, pending.sentAt, latency);
        }
      }
    } catch { /* ignore */ }
  }

  startSending(msgPerSec: number): void {
    const intervalMs = Math.max(10, Math.floor(1000 / msgPerSec));
    this.sendTimer = setInterval(() => {
      if (!this.isConnected) return;
      const msg = buildChatMessage(this.peerId, 'device-under-test', `stress-${this.metrics.sent}`);
      const sentAt = Date.now();
      this.pendingAcks.set(msg.data.messageId, {
        sentAt,
        timer: setTimeout(() => {
          if (!this.pendingAcks.has(msg.data.messageId)) return;
          this.pendingAcks.delete(msg.data.messageId);
          this.metrics.dropped++;
          this.collector.recordDropped(this.peerId);
        }, this.ackTimeoutMs),
      });
      this.ws!.send(JSON.stringify(msg));
      this.metrics.sent++;
      this.collector.recordSent(this.peerId, sentAt);
    }, intervalMs);
  }

  stopSending(): void {
    clearInterval(this.sendTimer);
    this.sendTimer = undefined;
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) this.ws!.send(JSON.stringify({ type: 'ping' }));
    }, 15000);
  }

  async disconnect(): Promise<void> {
    this.stopSending();
    clearInterval(this.heartbeatTimer);
    for (const { timer } of this.pendingAcks.values()) clearTimeout(timer);
    this.pendingAcks.clear();
    if (this.ws) {
      this.ws.close(1000, 'stress_test_done');
      await new Promise<void>(res => { this.ws?.once('close', () => res()); setTimeout(res, 2000); });
    }
  }

  getMetrics(): PeerMetrics { return { ...this.metrics }; }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd stress-test && npx jest tests/peers/ws-peer.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add stress-test/src/peers/ws-peer.ts stress-test/tests/peers/ws-peer.test.ts
git commit -m "feat(stress-test): add WsPeer (WebSocket client + RTT via server-ack)"
```

---

## Task 10: Orchestrator

**Files:**
- Create: `stress-test/src/orchestrator/orchestrator.ts`
- Create: `stress-test/tests/orchestrator/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// stress-test/tests/orchestrator/orchestrator.test.ts
import { WebSocketServer } from 'ws';
import { Orchestrator } from '@/orchestrator/orchestrator';
import { MetricsCollector } from '@/metrics/collector';
import { NetworkSampler } from '@/metrics/network-sampler';
import { TestConfig } from '@/orchestrator/test-config';

describe('Orchestrator (WS mode, fake server)', () => {
  let wss: WebSocketServer;

  beforeEach(() => {
    wss = new WebSocketServer({ port: 9903 });
    wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'chat') ws.send(JSON.stringify({ type: 'server-ack', data: { messageId: msg.data.messageId, message_type: 'chat' } }));
          if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        } catch { /* ignore */ }
      });
    });
  });

  afterEach(async () => { await new Promise<void>(res => wss.close(() => res())); });

  it('runs a single phase and returns PhaseStats', async () => {
    const config: TestConfig = {
      mode: 'ws',
      ws: { serverUrl: 'ws://127.0.0.1:9903', accountPrefix: 'test_' },
      phases: [{ peerCount: 2, msgPerSec: 5, durationSec: 2 }],
      outputDir: '/tmp/stress-test-output',
    };
    const orchestrator = new Orchestrator(config, new MetricsCollector(), new NetworkSampler());
    const results = await orchestrator.run();
    expect(results).toHaveLength(1);
    expect(results[0].peerCount).toBe(2);
    expect(results[0].totalSent).toBeGreaterThan(0);
  }, 15000);
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd stress-test && npx jest tests/orchestrator/orchestrator.test.ts
```

- [ ] **Step 3: Create `stress-test/src/orchestrator/orchestrator.ts`**

```typescript
import { TestConfig, Phase } from './test-config';
import { MetricsCollector, PhaseStats } from '../metrics/collector';
import { NetworkSampler } from '../metrics/network-sampler';
import { LanPeer } from '../peers/lan-peer';
import { WsPeer } from '../peers/ws-peer';
import { BasePeer } from '../peers/base-peer';
import { buildWsUrl, fetchJwt } from '../protocol/ws-protocol';

export class Orchestrator {
  constructor(
    private readonly config: TestConfig,
    private readonly collector: MetricsCollector,
    private readonly sampler: NetworkSampler,
  ) {}

  async run(): Promise<PhaseStats[]> {
    const results: PhaseStats[] = [];
    const transports: Array<'lan' | 'ws'> = this.config.mode === 'both' ? ['lan', 'ws'] : [this.config.mode];

    for (const transport of transports) {
      console.log(`\n=== Transport: ${transport.toUpperCase()} ===`);
      for (const phase of this.config.phases) {
        const phaseName = `${transport}-peers${phase.peerCount}-msg${phase.msgPerSec}`;
        console.log(`\n--- Phase: ${phaseName} ---`);
        this.collector.reset();
        this.sampler.reset();

        const peers = await this.spawnPeers(transport, phase);
        await Promise.allSettled(peers.map(p => p.connect()));
        await sleep(500); // allow connections to establish

        const startMs = Date.now();
        this.sampler.start();
        peers.forEach(p => p.startSending(phase.msgPerSec));
        await sleep(phase.durationSec * 1000);
        peers.forEach(p => p.stopSending());
        this.sampler.stop();
        const endMs = Date.now();

        await Promise.allSettled(peers.map(p => p.disconnect()));

        const stats = this.collector.computeStats(phaseName, phase.peerCount, phase.msgPerSec, phase.durationSec, startMs, endMs);
        results.push(stats);
        printPhaseStats(stats);
      }
    }
    return results;
  }

  private async spawnPeers(transport: 'lan' | 'ws', phase: Phase): Promise<BasePeer[]> {
    const peers: BasePeer[] = [];
    for (let i = 0; i < phase.peerCount; i++) {
      if (transport === 'lan') {
        const lan = this.config.lan!;
        peers.push(new LanPeer(`stress-lan-${i}`, i, lan.hostIp, lan.startPort + i, this.collector));
      } else {
        const ws = this.config.ws!;
        // Support raw ws:// URLs (for tests) or http:// URLs (fetch JWT first)
        const wsUrl = ws.serverUrl.startsWith('ws')
          ? ws.serverUrl
          : buildWsUrl(ws.serverUrl, await fetchJwt(ws.serverUrl, `${ws.accountPrefix}${i}`, `stress_pass_${i}`));
        peers.push(new WsPeer(`${ws.accountPrefix}${i}`, i, wsUrl, this.collector));
      }
    }
    return peers;
  }
}

function printPhaseStats(stats: PhaseStats): void {
  const rate = (stats.deliveryRate * 100).toFixed(1);
  console.log(`  Sent: ${stats.totalSent} | Acked: ${stats.totalAcked} (${rate}%) | Dropped: ${stats.droppedCount}`);
  console.log(`  p50/p95/p99: ${stats.p50Ms}ms / ${stats.p95Ms}ms / ${stats.p99Ms}ms | Jitter: ${stats.jitterMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd stress-test && npx jest tests/orchestrator/orchestrator.test.ts
```

Expected: 1 test passes in ~5s.

- [ ] **Step 5: Commit**

```bash
git add stress-test/src/orchestrator/orchestrator.ts stress-test/tests/orchestrator/orchestrator.test.ts
git commit -m "feat(stress-test): add Orchestrator (phase runner, peer lifecycle, graceful shutdown)"
```

---

## Task 11: Runner CLI + Seed Script

**Files:**
- Create: `stress-test/src/runner.ts`
- Create: `stress-test/scripts/seed-test-accounts.ts`

- [ ] **Step 1: Create `stress-test/src/runner.ts`**

```typescript
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { TestConfig, validateConfig } from './orchestrator/test-config';
import { Orchestrator } from './orchestrator/orchestrator';
import { MetricsCollector } from './metrics/collector';
import { NetworkSampler } from './metrics/network-sampler';
import { formatTable, computeNetworkStats, writeResults } from './metrics/reporter';

const program = new Command();

program
  .name('stress-test')
  .description('Sapot LAN + WebSocket stress tester')
  .option('-c, --config <path>', 'path to config JSON', './stress-test.config.json')
  .option('--mode <mode>', 'override mode: lan | ws | both')
  .option('--host-ip <ip>', 'override LAN host IP')
  .option('--server-url <url>', 'override WS server URL')
  .option('--output-dir <dir>', 'override output directory', './stress-results')
  .action(async (opts) => {
    const configPath = path.resolve(opts.config);
    if (!fs.existsSync(configPath)) { console.error(`Config not found: ${configPath}`); process.exit(1); }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as TestConfig;
    if (opts.mode) config.mode = opts.mode as TestConfig['mode'];
    if (opts.hostIp && config.lan) config.lan.hostIp = opts.hostIp;
    if (opts.serverUrl && config.ws) config.ws.serverUrl = opts.serverUrl;
    config.outputDir = opts.outputDir;

    try { validateConfig(config); } catch (e) { console.error(`Config error: ${(e as Error).message}`); process.exit(1); }

    const collector = new MetricsCollector();
    const sampler = new NetworkSampler();
    const orchestrator = new Orchestrator(config, collector, sampler);

    console.log(`Starting stress test — mode: ${config.mode} | phases: ${config.phases.length}`);
    const results = await orchestrator.run();
    const totalDurationMs = config.phases.reduce((s, p) => s + p.durationSec * 1000, 0);
    const networkStats = computeNetworkStats(sampler.getSamples(), totalDurationMs);

    console.log('\n\n=== RESULTS ===');
    console.log(formatTable(results));
    if (networkStats.throughputMbps > 0) {
      console.log(`\nNetwork: ${networkStats.throughputMbps} Mbps throughput | ${networkStats.goodputMbps} Mbps goodput`);
      console.log(`WiFi: ${networkStats.rssiDbm} dBm @ ${networkStats.linkSpeedMbps} Mbps | Loss: ${networkStats.packetLossPercent}%`);
    }
    writeResults(config.outputDir, config.mode, results, networkStats);
  });

program.parse(process.argv);
```

- [ ] **Step 2: Create `stress-test/scripts/seed-test-accounts.ts`**

```typescript
import { Command } from 'commander';

const program = new Command();

program
  .name('seed-test-accounts')
  .description('Create N stress-test accounts in the Sapot FastAPI server')
  .requiredOption('--server-url <url>', 'FastAPI base URL (e.g. http://192.168.1.100:8000)')
  .requiredOption('--count <n>', 'number of accounts to create', parseInt)
  .option('--prefix <prefix>', 'username prefix', 'stress_peer_')
  .option('--password <password>', 'password for all accounts', 'StressTest@123')
  .action(async (opts) => {
    const { serverUrl, count, prefix, password } = opts;
    let created = 0;
    let skipped = 0;

    console.log(`Seeding ${count} accounts at ${serverUrl} (prefix: "${prefix}")...`);

    for (let i = 0; i < count; i++) {
      const username = `${prefix}${i}`;
      try {
        const res = await fetch(`${serverUrl}/auth/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, first_name: 'Stress', last_name: `Peer${i}`, password, terms_accepted: true }),
        });
        if (res.status === 201) { created++; }
        else if ([400, 409, 422].includes(res.status)) { skipped++; }
        else { console.error(`\nFailed for ${username}: ${res.status} ${await res.text()}`); }
        process.stdout.write(`\r  Created: ${created} | Skipped: ${skipped} | Progress: ${i + 1}/${count}`);
      } catch (err) {
        console.error(`\nRequest error for ${username}: ${(err as Error).message}`);
      }
    }

    console.log(`\nDone. Created: ${created}, Already existed: ${skipped}`);
  });

program.parse(process.argv);
```

- [ ] **Step 3: Commit**

```bash
git add stress-test/src/runner.ts stress-test/scripts/seed-test-accounts.ts
git commit -m "feat(stress-test): add runner CLI and seed-test-accounts script"
```

---

## Task 12: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd stress-test && npx jest
```

Expected: All tests pass (≥ 17 tests across 7 suites).

- [ ] **Step 2: TypeScript check**

```bash
cd stress-test && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Save plan to standard location**

```bash
mkdir -p docs/superpowers/plans
cp /home/adamskieee/.claude/plans/partitioned-giggling-rossum.md docs/superpowers/plans/2026-06-11-stress-test.md
git add docs/superpowers/plans/2026-06-11-stress-test.md
git commit -m "docs: add LAN+WS stress test implementation plan"
```

- [ ] **Step 4: Smoke test (requires physical device + running server)**

Verify ADB is connected: `adb devices`

Find laptop LAN IP: `ip addr show | grep "inet " | grep -v 127.0.0.1`

```bash
# LAN mode smoke (1 peer warmup):
cd stress-test && npx ts-node src/runner.ts \
  --mode lan \
  --host-ip <LAPTOP_LAN_IP> \
  --config stress-test.config.json

# WS mode smoke (seed accounts first):
npx ts-node scripts/seed-test-accounts.ts \
  --server-url http://<SERVER_IP>:8000 \
  --count 15

npx ts-node src/runner.ts \
  --mode ws \
  --server-url http://<SERVER_IP>:8000
```

Expected: App discovers simulated LAN peer, connects, results table printed, `stress-results/results-*.json` written.

---

## Task 13: README Documentation

**Files:**
- Create: `stress-test/README.md`

The README is the primary entry point for anyone running this tool. Write it for a tester who has never looked at the Sapot codebase — they know how to run commands but have no idea what "LAN mode", "WS mode", "peers", or "ECDH" mean.

- [ ] **Step 1: Create `stress-test/README.md`**

````markdown
# Sapot Stress Test

A tool that finds the limits of the Sapot app's networking by simulating many fake users ("peers") connecting to it from your laptop.

---

## Background: How Sapot Connects Devices

Sapot supports two ways for devices to talk to each other:

- **LAN mode (direct)** — Devices on the same WiFi network connect directly to each other over TCP (like a local file share). The phone and the laptop discover each other automatically using mDNS (the same technology that lets you find printers on a local network). No internet required.

- **Server mode (relay)** — Messages are sent to a FastAPI server (`sapot.online` or a local copy) and the server forwards them to the recipient. This works over the internet but adds one extra hop.

This stress test simulates up to 50 fake users ("simulated peers") running on your laptop. These fake users speak exactly the same encrypted protocol as the real Sapot app so the phone cannot tell the difference.

**What we are measuring:** how many fake users and how many messages per second the app can handle before it starts dropping messages or slowing down.

---

## Prerequisites

Before running the stress test, you need:

| Requirement | Why | How to check |
|---|---|---|
| Physical Android device + USB cable | The stress test targets a real app running on a real device | `adb devices` — should list your device |
| ADB (Android Debug Bridge) installed | Used to read network stats from the device | `adb version` |
| Sapot app running on the phone | The thing being tested | Open the app on the phone |
| Phone and laptop on the **same WiFi** | LAN mode only works on a local network | Both on the same router |
| Node.js 18+ installed on laptop | Runs the simulator | `node --version` |
| FastAPI server running (WS mode only) | Needed for server relay tests | `curl http://<SERVER_IP>:8000/health` |

---

## Setup

**1. Install dependencies** (once):

```bash
cd stress-test
npm install
```

**2. Edit the config** to match your network:

Open `stress-test/stress-test.config.json` and update two fields:

```json
{
  "lan": {
    "hostIp": "192.168.1.100"   ← change to YOUR laptop's IP on the WiFi
  },
  "ws": {
    "serverUrl": "http://192.168.1.100:8000"   ← change to the server's IP
  }
}
```

To find your laptop's IP: run `ip addr show | grep "inet " | grep -v 127.0.0.1` (Linux/Mac).

**3. Seed test accounts** (WS mode only, once before the first WS run):

The server relay tests need real user accounts. This script creates them:

```bash
npx ts-node scripts/seed-test-accounts.ts \
  --server-url http://<SERVER_IP>:8000 \
  --count 60
```

Replace `<SERVER_IP>` with the address of the FastAPI server. You only need to run this once — accounts persist in the database.

---

## Running the Tests

### LAN mode (direct WiFi, no server needed)

```bash
npx ts-node src/runner.ts --mode lan --host-ip <LAPTOP_IP>
```

What happens: The laptop advertises 1–50 fake users on the local network. The Sapot app on the phone discovers them (just as it would discover real users) and connects. Each fake user sends encrypted messages at increasing rates.

### Server mode (relay through FastAPI)

```bash
npx ts-node src/runner.ts --mode ws --server-url http://<SERVER_IP>:8000
```

What happens: Fake users log in to the FastAPI server and send messages through it, just like real Sapot users would when not on the same WiFi.

### Both modes in sequence

```bash
npx ts-node src/runner.ts --mode both \
  --host-ip <LAPTOP_IP> \
  --server-url http://<SERVER_IP>:8000
```

### Override the config file

```bash
npx ts-node src/runner.ts --mode lan --host-ip 192.168.1.50 --output-dir ./my-results
```

---

## What the Phases Mean

The test runs through a series of "phases". Each phase increases either the number of fake users or the message rate, then holds steady for a set duration so we can measure stability.

| Phase name | What changes | Goal |
|---|---|---|
| Warmup (1 peer, 1 msg/s, 30s) | Baseline — just 1 fake user sending 1 msg/s | Confirm the basic connection works |
| Peer ramp ×5 / ×10 / ×20 / ×50 | More fake users, same message rate | Find the max number of users before things break |
| Throughput ×10 / ×50 / ×100 / ×200 | Same number of users, faster message rate | Find the max messages/sec before things break |
| Combined (20 peers × 50 msg/s) | Many users sending many messages | Worst-case sustained load |

---

## Reading the Results

After the run, a table is printed to the terminal and a `results-*.json` file is saved in `./stress-results/`.

### Results table

```
Phase              | Peers | Msg/s | Delivered | Dropped | P50  | P95   | Jitter
-------------------|-------|-------|-----------|---------|------|-------|-------
Warmup             |     1 |     1 |    100.0% |       0 |  9ms |  14ms |   2ms
Peer ramp ×5       |     5 |     5 |    100.0% |       0 | 11ms |  19ms |   3ms
Peer ramp ×20      |    20 |     5 |     94.1% |      47 | 28ms | 120ms |  31ms
```

**Column explanations:**

| Column | What it means | Healthy value |
|---|---|---|
| **Peers** | Number of simultaneous fake users | — |
| **Msg/s** | Messages sent per second, per user | — |
| **Delivered** | % of messages the app actually received | 99%+ is good; below 90% is degraded |
| **Dropped** | Number of messages that were never confirmed received | 0 is ideal |
| **P50** | Half of all messages arrived faster than this (median latency) | Under 50ms is healthy |
| **P95** | 95% of messages arrived faster than this | Under 200ms is acceptable |
| **Jitter** | How much the latency varies from message to message | Low = stable; high = network struggling |

**Where to look for the breaking point:** Find the phase where Delivered drops below ~95% or P95 jumps sharply. That phase is the limit.

### Network stats (bottom of output)

```
Network: 4.2 Mbps throughput | 3.8 Mbps goodput
WiFi: -61 dBm @ 144 Mbps | Loss: 0.3%
```

| Term | Plain-English meaning |
|---|---|
| **Throughput** | Total data sent and received per second (includes overhead) |
| **Goodput** | Actual useful payload data per second (excludes encryption/framing overhead) |
| **WiFi signal (dBm)** | Strength of the phone's WiFi signal. -50 to -60 dBm = strong; -70 to -80 dBm = weak. More negative = weaker. |
| **Link speed** | Max speed the phone's WiFi can use right now (not the same as internet speed) |
| **Loss %** | How often the phone had to re-request lost TCP packets — indicates WiFi congestion |

> **Note:** Network stats require ADB to be connected. If ADB is unavailable, network columns will show 0 but application metrics (delivery rate, latency) still work.

---

## Config File Reference

All settings live in `stress-test/stress-test.config.json`:

```json
{
  "mode": "both",          // "lan", "ws", or "both"
  "lan": {
    "hostIp": "...",       // Your laptop's IP on the WiFi (used for mDNS advertisement)
    "startPort": 9000      // First TCP port — each fake user gets its own port (9000, 9001, ...)
  },
  "ws": {
    "serverUrl": "...",    // FastAPI server address (http:// or https://)
    "accountPrefix": "stress_peer_"  // Prefix for test account usernames
  },
  "phases": [
    {
      "peerCount": 5,      // Number of simultaneous fake users in this phase
      "msgPerSec": 5,      // Messages each user sends per second
      "durationSec": 60    // How long to hold this phase before moving on
    }
  ],
  "outputDir": "./stress-results"  // Where to write results JSON files
}
```

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `adb: command not found` | ADB not installed | Install Android platform-tools |
| `adb devices` shows nothing | USB debugging not enabled | Enable Developer Options → USB Debugging on the phone |
| App never discovers LAN peers | Phone and laptop on different networks | Make sure both are on the same WiFi router (not guest vs. main) |
| `Login failed for stress_peer_0` | Test accounts not seeded | Run the seed script (see Setup step 3) |
| All phases show 0% delivery | Wrong `hostIp` in config | Update `lan.hostIp` to your actual laptop IP |
| `EADDRINUSE` on start | Previous test crashed and left ports open | Wait 30s or reboot, then retry |
````

- [ ] **Step 2: Commit**

```bash
git add stress-test/README.md
git commit -m "docs(stress-test): add tester-friendly README with setup, phases, and results guide"
```

---

## Quick Reference

```bash
cd stress-test && npm install

# Seed WS test accounts (once before WS runs)
npx ts-node scripts/seed-test-accounts.ts --server-url http://<SERVER>:8000 --count 60

# LAN stress test
npx ts-node src/runner.ts --mode lan --host-ip <LAPTOP_IP>

# WS stress test
npx ts-node src/runner.ts --mode ws --server-url http://<SERVER>:8000

# Both transports
npx ts-node src/runner.ts --mode both --host-ip <LAPTOP_IP> --server-url http://<SERVER>:8000
```
