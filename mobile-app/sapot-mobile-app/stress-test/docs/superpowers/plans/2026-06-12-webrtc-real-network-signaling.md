# WebRTC Real-Network Signaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new stress-test modes — `tcp-signaled` and `ws-signaled` — that route WebRTC SDP/ICE signals over the real network transports (LAN TCP and WebSocket relay) instead of in-process function calls, enabling realistic multi-machine and phone-vs-laptop WebRTC testing.

**Architecture:** Each new mode introduces a peer class that combines the TCP or WS transport layer (NaCl handshake / JWT auth already implemented in `LanPeer`/`WsPeer`) with `node-datachannel` `RTCPeerConnection`, sending `offer`/`answer`/`candidate` frames as encrypted messages over that transport. Signaling flows over a real network hop; ICE then negotiates a separate UDP data path. `WrtcPeer` keeps its in-process mode as the baseline.

**Tech Stack:** TypeScript, `node-datachannel` (WebRTC), `net` (TCP), `ws` (WebSocket), `tweetnacl` (NaCl encryption), Jest + ts-jest.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/protocol/tcp-protocol.ts` | Add `SignalMessage`, `TcpSignalPayload`, builders, type guard |
| Modify | `src/protocol/ws-protocol.ts` | Add `WsSignalMessage`, builder, type guard |
| Modify | `src/peers/webrtc-peer.ts` | Remove `SignalMessage` definition; import from tcp-protocol |
| Create | `src/peers/rtp-utils.ts` | Extracted `buildRtpPacket` + `buildVideoRtpPacket` (shared by all WebRTC peers) |
| Modify | `src/peers/webrtc-peer.ts` | Import RTP builders from rtp-utils |
| Create | `src/peers/tcp-signaled-wrtc-peer.ts` | TCP-signaled `RTCPeerConnection` peer |
| Create | `src/peers/ws-signaled-wrtc-peer.ts` | WS-signaled `RTCPeerConnection` peer |
| Modify | `src/orchestrator/test-config.ts` | Extend mode union; add validation for new modes |
| Modify | `src/orchestrator/orchestrator.ts` | Add `tcp-signaled` and `ws-signaled` branches + factory methods |
| Modify | `tests/protocol/tcp-protocol.test.ts` | Add `TcpSignalPayload` round-trip test |
| Modify | `tests/protocol/ws-protocol.test.ts` | Add `WsSignalMessage` builder test |
| Modify | `tests/orchestrator/test-config.test.ts` | Validation tests for new modes |
| Create | `tests/peers/tcp-signaled-wrtc-peer.test.ts` | Integration tests with real TCP sockets |
| Create | `tests/peers/ws-signaled-wrtc-peer.test.ts` | Integration tests with fake WS relay server |
| Create | `stress-test.tcp-signaled.config.json` | Example config for TCP-signaled mode |
| Create | `stress-test.ws-signaled.config.json` | Example config for WS-signaled mode |

---

## Task 1: Protocol Extensions — `SignalMessage`, `TcpSignalPayload`, `WsSignalMessage`

**Files:**
- Modify: `src/protocol/tcp-protocol.ts`
- Modify: `src/protocol/ws-protocol.ts`
- Modify: `src/peers/webrtc-peer.ts`
- Modify: `tests/protocol/tcp-protocol.test.ts`
- Modify: `tests/protocol/ws-protocol.test.ts`

- [ ] **Step 1.1: Write failing tests for the new protocol types**

Add to `tests/protocol/tcp-protocol.test.ts` (after existing tests):

```typescript
import {
  generateKeyPair, computeSharedKey, encryptMessage, decryptMessage,
  buildHandshakeInit, buildHandshakeAck, parsePublicKey,
  buildTcpSignalPayload, isTcpSignalPayload,
} from '@/protocol/tcp-protocol';

// ... keep existing tests ...

describe('TcpSignalPayload', () => {
  it('buildTcpSignalPayload wraps a SignalMessage with type=signal', () => {
    const payload = buildTcpSignalPayload({ type: 'offer', sdp: 'v=0\r\n' });
    expect(payload.type).toBe('signal');
    expect(payload.signal).toEqual({ type: 'offer', sdp: 'v=0\r\n' });
  });

  it('isTcpSignalPayload returns true for a valid payload', () => {
    const payload = buildTcpSignalPayload({ type: 'candidate', candidate: 'c', mid: '0' });
    expect(isTcpSignalPayload(payload)).toBe(true);
  });

  it('isTcpSignalPayload returns false for non-signal messages', () => {
    expect(isTcpSignalPayload({ type: 'stress-chat', seq: 1 })).toBe(false);
    expect(isTcpSignalPayload({ type: 'signal' })).toBe(false); // missing signal field
  });

  it('round-trips a TcpSignalPayload through NaCl encrypt/decrypt', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const sharedKey = computeSharedKey(alice.secretKey, bob.publicKey);
    const bobShared = computeSharedKey(bob.secretKey, alice.publicKey);
    const payload = buildTcpSignalPayload({ type: 'answer', sdp: 'v=0\r\nfoo' });
    const envelope = encryptMessage(sharedKey, payload as Record<string, unknown>);
    const decrypted = decryptMessage(bobShared, envelope);
    expect(isTcpSignalPayload(decrypted)).toBe(true);
    expect((decrypted as typeof payload).signal).toEqual({ type: 'answer', sdp: 'v=0\r\nfoo' });
  });
});
```

Add to `tests/protocol/ws-protocol.test.ts` (after existing tests):

```typescript
import {
  decodeToken, buildWsUrl, buildChatMessage, fetchJwt, isServerAck, isPong,
  buildWsSignalMessage, isWsSignalMessage,
} from '@/protocol/ws-protocol';

// ... keep existing tests ...

describe('WsSignalMessage', () => {
  it('buildWsSignalMessage produces correct shape', () => {
    const msg = buildWsSignalMessage('user-a', 'user-b', { type: 'offer', sdp: 'v=0\r\n' });
    expect(msg.type).toBe('signal');
    expect(msg.data.from).toBe('user-a');
    expect(msg.data.to).toBe('user-b');
    expect(msg.data.signal).toEqual({ type: 'offer', sdp: 'v=0\r\n' });
  });

  it('isWsSignalMessage returns true for valid signal message', () => {
    const msg = buildWsSignalMessage('a', 'b', { type: 'candidate', candidate: 'c', mid: '0' });
    expect(isWsSignalMessage(msg)).toBe(true);
  });

  it('isWsSignalMessage returns false for chat message', () => {
    expect(isWsSignalMessage({ type: 'chat', data: { from: 'a', to: 'b' } })).toBe(false);
  });

  it('isWsSignalMessage returns false for non-objects', () => {
    expect(isWsSignalMessage(null)).toBe(false);
    expect(isWsSignalMessage('signal')).toBe(false);
  });
});
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
npx jest tests/protocol/ -t "TcpSignalPayload|WsSignalMessage" --no-coverage
```

Expected: FAIL — `buildTcpSignalPayload`, `isTcpSignalPayload`, `buildWsSignalMessage`, `isWsSignalMessage` not exported yet.

- [ ] **Step 1.3: Add `SignalMessage`, `TcpSignalPayload`, and helpers to `tcp-protocol.ts`**

Add at the bottom of `src/protocol/tcp-protocol.ts`:

```typescript
export type SignalMessage =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'candidate'; candidate: string; mid: string };

export interface TcpSignalPayload {
  type: 'signal';
  signal: SignalMessage;
}

export function buildTcpSignalPayload(signal: SignalMessage): TcpSignalPayload {
  return { type: 'signal', signal };
}

export function isTcpSignalPayload(msg: StressMessage): msg is TcpSignalPayload {
  return msg['type'] === 'signal' && msg['signal'] != null;
}
```

- [ ] **Step 1.4: Add `WsSignalMessage` and helpers to `ws-protocol.ts`**

Add at the top of `src/protocol/ws-protocol.ts` (after `import { randomUUID } from 'crypto';`):

```typescript
import type { SignalMessage } from './tcp-protocol';
```

Add at the bottom of `src/protocol/ws-protocol.ts`:

```typescript
export interface WsSignalMessage {
  type: 'signal';
  data: {
    from: string;
    to: string;
    signal: SignalMessage;
  };
}

export function buildWsSignalMessage(from: string, to: string, signal: SignalMessage): WsSignalMessage {
  return { type: 'signal', data: { from, to, signal } };
}

export function isWsSignalMessage(msg: unknown): msg is WsSignalMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  if (m['type'] !== 'signal') return false;
  const d = m['data'] as Record<string, unknown> | undefined;
  return typeof d?.['from'] === 'string' && d?.['signal'] != null;
}
```

- [ ] **Step 1.5: Remove `SignalMessage` from `webrtc-peer.ts` and import from `tcp-protocol.ts`**

In `src/peers/webrtc-peer.ts`, replace:

```typescript
export type SignalMessage =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'candidate'; candidate: string; mid: string };
```

With:

```typescript
import { SignalMessage } from '../protocol/tcp-protocol';
export type { SignalMessage };
```

- [ ] **Step 1.6: Run tests to confirm they pass**

```bash
npx jest tests/protocol/ --no-coverage
```

Expected: all PASS including new `TcpSignalPayload` and `WsSignalMessage` tests.

- [ ] **Step 1.7: Typecheck**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 1.8: Commit**

```bash
git add src/protocol/tcp-protocol.ts src/protocol/ws-protocol.ts src/peers/webrtc-peer.ts \
        tests/protocol/tcp-protocol.test.ts tests/protocol/ws-protocol.test.ts
git commit -m "feat(stress-test): add SignalMessage and TcpSignalPayload to tcp-protocol, WsSignalMessage to ws-protocol"
```

---

## Task 2: Extract RTP Builders + Config Extensions

**Files:**
- Create: `src/peers/rtp-utils.ts`
- Modify: `src/peers/webrtc-peer.ts`
- Modify: `src/orchestrator/test-config.ts`
- Modify: `tests/orchestrator/test-config.test.ts`

- [ ] **Step 2.1: Write failing config validation tests**

Add to `tests/orchestrator/test-config.test.ts` (after existing tests):

```typescript
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
```

- [ ] **Step 2.2: Run to confirm they fail**

```bash
npx jest tests/orchestrator/test-config.test.ts --no-coverage
```

Expected: FAIL — `'tcp-signaled'` and `'ws-signaled'` are not valid modes yet.

- [ ] **Step 2.3: Create `src/peers/rtp-utils.ts`**

```typescript
export function buildRtpPacket(seq: number, timestamp: number, ssrc: number): Buffer {
  const header = Buffer.alloc(12);
  header[0] = 0x80;
  header[1] = 111;
  header.writeUInt16BE(seq & 0xffff, 2);
  header.writeUInt32BE(timestamp >>> 0, 4);
  header.writeUInt32BE(ssrc >>> 0, 8);
  return Buffer.concat([header, Buffer.alloc(3, 0)]);
}

export function buildVideoRtpPacket(
  seq: number,
  timestamp: number,
  ssrc: number,
  payloadBytes: number,
): Buffer {
  const header = Buffer.alloc(12);
  header[0] = 0x80;
  header[1] = 96; // PT=96 (H.264)
  header.writeUInt16BE(seq & 0xffff, 2);
  header.writeUInt32BE(timestamp >>> 0, 4);
  header.writeUInt32BE(ssrc >>> 0, 8);
  return Buffer.concat([header, Buffer.alloc(payloadBytes, 0)]);
}
```

- [ ] **Step 2.4: Update `src/peers/webrtc-peer.ts` to use rtp-utils**

Replace the two local `buildRtpPacket` / `buildVideoRtpPacket` function definitions at the top of `webrtc-peer.ts` with:

```typescript
import { buildRtpPacket, buildVideoRtpPacket } from './rtp-utils';
```

- [ ] **Step 2.5: Update `src/orchestrator/test-config.ts` — extend mode union and validateConfig**

Replace the `mode` field type in `TestConfig`:

```typescript
export interface TestConfig {
  mode: "lan" | "ws" | "both" | "webrtc" | "tcp-signaled" | "ws-signaled";
  lan?: LanConfig;
  ws?: WsConfig;
  webrtc?: WebrtcConfig;
  phases: Phase[];
  outputDir: string;
}
```

Add two new blocks in `validateConfig` after the existing `if (config.mode === "webrtc" && !config.webrtc)` check and before the phases loop:

```typescript
  if (config.mode === "tcp-signaled") {
    if (!config.lan) throw new Error("lan config required for mode tcp-signaled");
    if (!config.webrtc) throw new Error("webrtc config required for mode tcp-signaled");
  }
  if (config.mode === "ws-signaled") {
    if (!config.ws) throw new Error("ws config required for mode ws-signaled");
    if (!config.webrtc) throw new Error("webrtc config required for mode ws-signaled");
  }
```

Inside the `for (const p of config.phases)` loop, replace:

```typescript
    if (config.mode === "webrtc" && p.peerCount % 2 !== 0)
      throw new Error("peerCount must be even for webrtc mode");
```

With:

```typescript
    if (
      (config.mode === "webrtc" ||
        config.mode === "tcp-signaled" ||
        config.mode === "ws-signaled") &&
      p.peerCount % 2 !== 0
    )
      throw new Error(`peerCount must be even for ${config.mode} mode`);
```

- [ ] **Step 2.6: Run tests**

```bash
npx jest tests/orchestrator/test-config.test.ts --no-coverage
```

Expected: all PASS.

- [ ] **Step 2.7: Typecheck**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 2.8: Commit**

```bash
git add src/peers/rtp-utils.ts src/peers/webrtc-peer.ts \
        src/orchestrator/test-config.ts \
        tests/orchestrator/test-config.test.ts
git commit -m "feat(stress-test): extract rtp-utils, add tcp-signaled and ws-signaled to mode union"
```

---

## Task 3: `TcpSignaledWrtcPeer` Implementation

**Files:**
- Create: `src/peers/tcp-signaled-wrtc-peer.ts`
- Create: `tests/peers/tcp-signaled-wrtc-peer.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `tests/peers/tcp-signaled-wrtc-peer.test.ts`:

```typescript
import net from 'net';
import { TcpSignaledWrtcPeer } from '@/peers/tcp-signaled-wrtc-peer';
import { MetricsCollector } from '@/metrics/collector';
import { WebrtcConfig } from '@/orchestrator/test-config';

const cfg: WebrtcConfig = { connectionTimeoutMs: 10000 };
const fastCfg: WebrtcConfig = { connectionTimeoutMs: 300 };

describe('TcpSignaledWrtcPeer', () => {
  it('connect() starts a TCP server and assigns a port', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('peer-0', 0, '127.0.0.1', 0, col, cfg);
    await peer.connect();
    expect(peer.port).toBeGreaterThan(0);
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.createConnection({ host: '127.0.0.1', port: peer.port }, () => resolve(s));
      s.on('error', reject);
    });
    socket.destroy();
    await peer.disconnect();
  }, 5000);

  it('offerer and answerer negotiate via TCP signaling; iceEstablishMs is populated', async () => {
    const col = new MetricsCollector();
    const offerer = new TcpSignaledWrtcPeer('peer-0', 0, '127.0.0.1', 0, col, cfg);
    const answerer = new TcpSignaledWrtcPeer('peer-1', 1, '127.0.0.1', 0, col, cfg);

    await Promise.all([offerer.connect(), answerer.connect()]);
    await offerer.connectTo('127.0.0.1', answerer.port);

    expect(offerer.getMetrics().iceEstablishMs.length).toBeGreaterThanOrEqual(1);
    expect(offerer.getMetrics().connectionErrors).toBe(0);
    expect(offerer.getMetrics().connectionTimeouts).toBe(0);

    await Promise.all([offerer.disconnect(), answerer.disconnect()]);
  }, 20000);

  it('startSending increments sent count on the data channel after connectTo', async () => {
    const col = new MetricsCollector();
    const offerer = new TcpSignaledWrtcPeer('peer-0', 0, '127.0.0.1', 0, col, cfg);
    const answerer = new TcpSignaledWrtcPeer('peer-1', 1, '127.0.0.1', 0, col, cfg);

    await Promise.all([offerer.connect(), answerer.connect()]);
    await offerer.connectTo('127.0.0.1', answerer.port);

    offerer.startSending(10);
    answerer.startSending(10);
    await new Promise((r) => setTimeout(r, 500));
    offerer.stopSending();
    answerer.stopSending();

    expect(offerer.getMetrics().sent).toBeGreaterThan(0);

    await Promise.all([offerer.disconnect(), answerer.disconnect()]);
  }, 20000);

  it('records connectionError when the target port is not listening', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('peer-0', 0, '127.0.0.1', 0, col, fastCfg);
    await peer.connect();
    await peer.connectTo('127.0.0.1', 19998);
    expect(peer.getMetrics().connectionErrors).toBe(1);
    await peer.disconnect();
  }, 5000);

  it('getMetrics returns a snapshot copy', async () => {
    const col = new MetricsCollector();
    const peer = new TcpSignaledWrtcPeer('peer-0', 0, '127.0.0.1', 0, col, fastCfg);
    await peer.connect();
    const m1 = peer.getMetrics();
    const m2 = peer.getMetrics();
    expect(m1).not.toBe(m2);
    await peer.disconnect();
  }, 5000);
});
```

- [ ] **Step 3.2: Run to confirm they fail**

```bash
npx jest tests/peers/tcp-signaled-wrtc-peer.test.ts --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3.3: Create `src/peers/tcp-signaled-wrtc-peer.ts`**

```typescript
import net from 'net';
import nodeDatachannel, { Audio, Video } from 'node-datachannel';
import type { DataChannel, Track } from 'node-datachannel';
import { encodeBase64 } from 'tweetnacl-util';
import {
  generateKeyPair,
  computeSharedKey,
  encryptMessage,
  decryptMessage,
  buildHandshakeAck,
  parsePublicKey,
  buildTcpSignalPayload,
  isTcpSignalPayload,
  SignalMessage,
  EncryptedEnvelope,
} from '../protocol/tcp-protocol';
import { BasePeer, PeerMetrics, emptyMetrics } from './base-peer';
import { MetricsCollector } from '../metrics/collector';
import { WebrtcConfig } from '../orchestrator/test-config';
import { buildRtpPacket, buildVideoRtpPacket } from './rtp-utils';

export class TcpSignaledWrtcPeer implements BasePeer {
  readonly peerId: string;
  readonly peerIndex: number;

  private server: net.Server;
  private _port: number;

  // Inbound (answerer): socket from the offerer's connectTo()
  private serverSocket?: net.Socket;
  private serverSharedKey?: Uint8Array;
  private serverHandshakeDone = false;
  private serverReceiveBuffer = '';

  // Outbound (offerer): socket to the answerer's server
  private clientSocket?: net.Socket;
  private clientSharedKey?: Uint8Array;
  private clientReceiveBuffer = '';

  // WebRTC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pc: any = null;
  private dc: DataChannel | null = null;

  private audioTrack: Track | null = null;
  private audioTimer: NodeJS.Timeout | null = null;
  private rtpSeq = 0;
  private rtpTimestamp = 0;
  private readonly rtpSsrc = Math.floor(Math.random() * 0xffffffff);

  private videoTrack: Track | null = null;
  private videoTimer: NodeJS.Timeout | null = null;
  private videoSeq = 0;
  private videoTimestamp = 0;
  private readonly videoSsrc = Math.floor(Math.random() * 0xffffffff);

  private sendTimer: NodeJS.Timeout | null = null;
  private seqNo = 0;
  private metrics: PeerMetrics = emptyMetrics();

  constructor(
    peerId: string,
    peerIndex: number,
    private readonly hostIp: string,
    port: number,
    private readonly collector: MetricsCollector,
    private readonly config: WebrtcConfig,
  ) {
    this.peerId = peerId;
    this.peerIndex = peerIndex;
    this._port = port;
    this.server = net.createServer();
  }

  get port(): number { return this._port; }
  private get isOfferer(): boolean { return this.peerIndex % 2 === 0; }

  // Starts the TCP server. Answerers wait passively; offerer later calls connectTo().
  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.server.off('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        this.server.off('error', onError);
        const addr = this.server.address();
        if (addr && typeof addr === 'object') this._port = addr.port;
        this.server.on('connection', (socket) => this.handleInbound(socket));
        resolve();
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(this._port, '0.0.0.0');
    });
  }

  // Offerer calls this: TCP connect → ECDH → create PC + offer → wait for ICE connected.
  connectTo(host: string, port: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const startMs = Date.now();
      const timeoutMs = this.config.connectionTimeoutMs ?? 15_000;
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.metrics.connectionTimeouts++;
        this.metrics.connectionErrors++;
        this.collector.recordConnectionTimeout();
        this.collector.recordConnectionError();
        resolve();
      }, timeoutMs);

      const kp = generateKeyPair();
      const socket = net.createConnection({ host, port }, () => {
        socket.write(
          JSON.stringify({ type: 'handshake-init', pub: encodeBase64(kp.publicKey) }) + '\n',
        );
      });
      let buf = '';

      socket.on('data', (raw) => {
        buf += raw.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const frame = JSON.parse(line) as Record<string, unknown>;
            if (frame['type'] === 'handshake-ack' && !this.clientSocket) {
              const sharedKey = computeSharedKey(kp.secretKey, parsePublicKey(frame['pub'] as string));
              this.clientSocket = socket;
              this.clientSharedKey = sharedKey;
              this.createPc(
                (elapsed) => {
                  if (settled) return;
                  settled = true;
                  clearTimeout(timer);
                  this.metrics.iceEstablishMs.push(elapsed);
                  this.collector.recordIceEstablish(this.peerId, elapsed);
                  resolve();
                },
                () => {
                  if (settled) return;
                  settled = true;
                  clearTimeout(timer);
                  this.metrics.connectionErrors++;
                  this.collector.recordConnectionError();
                  resolve();
                },
                startMs,
                (msg) => this.sendViaClient(msg),
              );
            } else if (frame['type'] === 'encrypted' && this.clientSharedKey) {
              const msg = decryptMessage(this.clientSharedKey, frame as unknown as EncryptedEnvelope);
              if (isTcpSignalPayload(msg)) this.receiveSignal(msg.signal);
            }
          } catch { /* ignore malformed frames */ }
        }
      });

      socket.on('error', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.metrics.connectionErrors++;
        this.collector.recordConnectionError();
        resolve();
      });

      socket.on('close', () => {
        this.clientSocket = undefined;
        this.clientSharedKey = undefined;
      });
    });
  }

  private handleInbound(socket: net.Socket): void {
    this.serverSocket = socket;
    const kp = generateKeyPair();
    this.serverReceiveBuffer = '';
    this.serverHandshakeDone = false;
    let iceStartMs = 0;

    socket.on('data', (raw) => {
      this.serverReceiveBuffer += raw.toString('utf8');
      const lines = this.serverReceiveBuffer.split('\n');
      this.serverReceiveBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const frame = JSON.parse(line) as Record<string, unknown>;
          if (!this.serverHandshakeDone) {
            if (frame['type'] !== 'handshake-init') return;
            this.serverSharedKey = computeSharedKey(
              kp.secretKey,
              parsePublicKey(frame['pub'] as string),
            );
            socket.write(JSON.stringify(buildHandshakeAck(kp.publicKey)) + '\n');
            this.serverHandshakeDone = true;
          } else if (frame['type'] === 'encrypted' && this.serverSharedKey) {
            const msg = decryptMessage(this.serverSharedKey, frame as unknown as EncryptedEnvelope);
            if (isTcpSignalPayload(msg)) {
              if (!this.pc) {
                iceStartMs = Date.now();
                this.createPc(
                  (elapsed) => {
                    this.metrics.iceEstablishMs.push(elapsed);
                    this.collector.recordIceEstablish(this.peerId, elapsed);
                  },
                  () => {
                    this.metrics.connectionErrors++;
                    this.collector.recordConnectionError();
                  },
                  iceStartMs,
                  (signal) => this.sendViaServer(signal),
                );
              }
              this.receiveSignal(msg.signal);
            }
          }
        } catch { /* ignore */ }
      }
    });

    socket.on('error', () => {
      this.metrics.connectionErrors++;
      this.collector.recordConnectionError();
    });
    socket.on('close', () => {
      this.serverSocket = undefined;
      this.serverHandshakeDone = false;
      this.serverSharedKey = undefined;
    });
  }

  private createPc(
    onConnected: (elapsedMs: number) => void,
    onFailed: () => void,
    startMs: number,
    sendSignal: (msg: SignalMessage) => void,
  ): void {
    const iceServers = (this.config.iceServers ?? []).map((s) => s.urls);
    const pc = new nodeDatachannel.PeerConnection(this.peerId, { iceServers });
    this.pc = pc;

    pc.onStateChange((state: string) => {
      if (state === 'connected') onConnected(Date.now() - startMs);
      else if (state === 'failed') onFailed();
    });

    pc.onLocalDescription((sdp: string, type: string) => {
      sendSignal({ type: type as 'offer' | 'answer', sdp });
    });

    pc.onLocalCandidate((candidate: string, mid: string) => {
      sendSignal({ type: 'candidate', candidate, mid });
    });

    if (this.config.media) {
      try {
        const audio = new Audio('audio', 'SendOnly');
        audio.addOpusCodec(111);
        const track = pc.addTrack(audio) as Track;
        this.setupAudioTrack(track);
      } catch { /* media not supported */ }
      if (this.config.media.type === 'audio-video') {
        try {
          const video = new Video('video', 'SendOnly');
          video.addH264Codec(96);
          this.videoTrack = pc.addTrack(video) as Track;
        } catch { /* video not supported */ }
      }
    }

    if (this.isOfferer) {
      const dc = pc.createDataChannel('chat');
      this.setupDataChannel(dc);
    } else {
      pc.onDataChannel((dc: DataChannel) => {
        this.setupDataChannel(dc);
      });
    }
  }

  private receiveSignal(signal: SignalMessage): void {
    if (!this.pc) return;
    if (signal.type === 'offer' || signal.type === 'answer') {
      this.pc.setRemoteDescription(signal.sdp, signal.type);
    } else if (signal.type === 'candidate') {
      this.pc.addRemoteCandidate(signal.candidate, signal.mid);
    }
  }

  private sendViaClient(msg: SignalMessage): void {
    if (!this.clientSocket || !this.clientSharedKey) return;
    try {
      const envelope = encryptMessage(
        this.clientSharedKey,
        buildTcpSignalPayload(msg) as unknown as Record<string, unknown>,
      );
      this.clientSocket.write(JSON.stringify(envelope) + '\n');
    } catch { /* socket closed */ }
  }

  private sendViaServer(msg: SignalMessage): void {
    if (!this.serverSocket || !this.serverSharedKey) return;
    try {
      const envelope = encryptMessage(
        this.serverSharedKey,
        buildTcpSignalPayload(msg) as unknown as Record<string, unknown>,
      );
      this.serverSocket.write(JSON.stringify(envelope) + '\n');
    } catch { /* socket closed */ }
  }

  private setupDataChannel(dc: DataChannel): void {
    this.dc = dc;
    dc.onMessage((msg: string | ArrayBuffer | Buffer) => {
      const raw = typeof msg === 'string' ? msg : Buffer.from(msg as ArrayBuffer).toString();
      if (raw.startsWith('MSG:')) {
        const parts = raw.split(':');
        if (dc.isOpen()) dc.sendMessage(`ACK:${parts[1]}:${parts[2]}`);
      } else if (raw.startsWith('ACK:')) {
        const parts = raw.split(':');
        const sentAt = parseInt(parts[2], 10);
        const latencyMs = Date.now() - sentAt;
        this.metrics.acked++;
        this.metrics.writeLatencySamples.push(latencyMs);
        this.collector.recordAcked(this.peerId, sentAt, latencyMs);
      }
    });
  }

  private setupAudioTrack(track: Track): void {
    this.audioTrack = track;
    const startMs = Date.now();
    track.onOpen(() => {
      const elapsed = Date.now() - startMs;
      this.metrics.mediaEstablishMs.push(elapsed);
      this.collector.recordMediaEstablish(this.peerId, elapsed);
    });
  }

  startSending(msgPerSec: number): void {
    const intervalMs = Math.max(10, Math.floor(1_000 / msgPerSec));
    this.sendTimer = setInterval(() => {
      if (!this.dc?.isOpen()) return;
      const sentAt = Date.now();
      const ok = this.dc.sendMessage(`MSG:${this.seqNo++}:${sentAt}`);
      if (ok) {
        this.metrics.sent++;
        this.collector.recordSent(this.peerId, sentAt);
      } else {
        this.metrics.dropped++;
        this.collector.recordDropped(this.peerId);
      }
    }, intervalMs);

    if (this.audioTrack) {
      this.audioTimer = setInterval(() => {
        try {
          const packet = buildRtpPacket(this.rtpSeq++, this.rtpTimestamp, this.rtpSsrc);
          this.rtpTimestamp += 960;
          const ok = this.audioTrack?.sendMessageBinary(packet) ?? false;
          if (ok) { this.metrics.rtpPacketsSent++; this.collector.recordRtpSent(this.peerId); }
          else { this.metrics.rtpPacketsLost++; this.collector.recordRtpLost(this.peerId); }
        } catch { /* track closed */ }
      }, 20);
    }

    if (this.videoTrack) {
      const bitrate = this.config.media?.bitrate ?? 1000;
      const bytesPerFrame = Math.floor((bitrate * 1000) / 8 / 30);
      this.videoTimer = setInterval(() => {
        try {
          const packet = buildVideoRtpPacket(this.videoSeq++, this.videoTimestamp, this.videoSsrc, bytesPerFrame);
          this.videoTimestamp += 3000;
          const ok = this.videoTrack?.sendMessageBinary(packet) ?? false;
          if (ok) { this.metrics.rtpPacketsSent++; this.collector.recordRtpSent(this.peerId); }
          else { this.metrics.rtpPacketsLost++; this.collector.recordRtpLost(this.peerId); }
        } catch { /* track closed */ }
      }, 33);
    }
  }

  stopSending(): void {
    if (this.sendTimer !== null) { clearInterval(this.sendTimer); this.sendTimer = null; }
    if (this.audioTimer !== null) { clearInterval(this.audioTimer); this.audioTimer = null; }
    if (this.videoTimer !== null) { clearInterval(this.videoTimer); this.videoTimer = null; }
  }

  async disconnect(): Promise<void> {
    this.stopSending();
    try { this.dc?.close(); } catch { /* ignore */ }
    try { this.audioTrack?.close(); } catch { /* ignore */ }
    try { this.videoTrack?.close(); } catch { /* ignore */ }
    this.audioTrack = null;
    this.videoTrack = null;
    this.dc = null;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 200);
      try { this.pc?.close(); } catch { /* ignore */ }
    });
    this.pc = null;
    this.clientSocket?.destroy();
    this.serverSocket?.destroy();
    await Promise.race([
      new Promise<void>((res) => this.server.close(() => res())),
      new Promise<void>((res) => setTimeout(res, 500)),
    ]);
  }

  getMetrics(): PeerMetrics {
    return {
      ...this.metrics,
      writeLatencySamples: [...this.metrics.writeLatencySamples],
      iceEstablishMs: [...this.metrics.iceEstablishMs],
      mediaEstablishMs: [...this.metrics.mediaEstablishMs],
    };
  }
}
```

- [ ] **Step 3.4: Run tests**

```bash
npx jest tests/peers/tcp-signaled-wrtc-peer.test.ts --no-coverage
```

Expected: all PASS. (The ICE tests take several seconds as `node-datachannel` negotiates on loopback.)

- [ ] **Step 3.5: Typecheck**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3.6: Commit**

```bash
git add src/peers/rtp-utils.ts src/peers/tcp-signaled-wrtc-peer.ts \
        tests/peers/tcp-signaled-wrtc-peer.test.ts
git commit -m "feat(stress-test): add TcpSignaledWrtcPeer — WebRTC over encrypted LAN TCP signaling"
```

---

## Task 4: `WsSignaledWrtcPeer` Implementation

**Files:**
- Create: `src/peers/ws-signaled-wrtc-peer.ts`
- Create: `tests/peers/ws-signaled-wrtc-peer.test.ts`

**Important context:** The Sapot server's WS relay routes any JSON message with a `data.to` field to the target peer. Signal messages use `{ type: 'signal', data: { from, to, signal: {...} } }`. Before running against a real server, verify `server/app/connection_manager.py` routes `signal` type messages (it should, as it routes by `data.to`). The test fake server implements this routing.

- [ ] **Step 4.1: Write failing tests**

Create `tests/peers/ws-signaled-wrtc-peer.test.ts`:

```typescript
import http from 'http';
import { WebSocketServer, WebSocket as WS } from 'ws';
import { WsSignaledWrtcPeer } from '@/peers/ws-signaled-wrtc-peer';
import { MetricsCollector } from '@/metrics/collector';
import { WebrtcConfig } from '@/orchestrator/test-config';

// Fake server: serves POST /auth/token (JWT with sub=username) and relays WS messages by data.to.
function startFakeSignalingServer(port: number): { close: () => Promise<void> } {
  const connections = new Map<string, WS>();

  const httpServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/auth/token') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const username = params.get('username') ?? 'unknown';
        const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64');
        const payload = Buffer.from(JSON.stringify({ sub: username })).toString('base64');
        const token = `${header}.${payload}.sig`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: token }));
      });
      return;
    }
    res.writeHead(404); res.end();
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '', 'ws://localhost');
    const token = url.searchParams.get('token') ?? '';
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      ) as Record<string, unknown>;
      const userId = payload['sub'] as string;
      connections.set(userId, ws);
      ws.on('close', () => connections.delete(userId));
    } catch { /* ignore bad tokens */ }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (msg['type'] === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }
        const data = msg['data'] as Record<string, unknown> | undefined;
        if (typeof data?.['to'] === 'string') {
          const target = connections.get(data['to'] as string);
          if (target?.readyState === WS.OPEN) target.send(raw.toString());
        }
      } catch { /* ignore */ }
    });
  });

  httpServer.listen(port);
  return {
    close: () => new Promise<void>((res) => wss.close(() => httpServer.close(() => res()))),
  };
}

const SERVER_URL = 'http://127.0.0.1:9910';
const cfg: WebrtcConfig = { connectionTimeoutMs: 12000 };

describe('WsSignaledWrtcPeer', () => {
  let serverHandle: ReturnType<typeof startFakeSignalingServer>;

  beforeEach(() => { serverHandle = startFakeSignalingServer(9910); });
  afterEach(async () => { await serverHandle.close(); });

  it('connect() resolves with a userId derived from the JWT', async () => {
    const col = new MetricsCollector();
    const peer = new WsSignaledWrtcPeer('peer-0', 0, SERVER_URL, col, { username: 'alice', password: 'pw' }, cfg);
    await peer.connect();
    expect(peer.userId).toBe('alice');
    await peer.disconnect();
  }, 10000);

  it('offerer and answerer negotiate over WS relay; iceEstablishMs is populated', async () => {
    const col = new MetricsCollector();
    const offerer = new WsSignaledWrtcPeer('peer-0', 0, SERVER_URL, col, { username: 'alice', password: 'pw' }, cfg);
    const answerer = new WsSignaledWrtcPeer('peer-1', 1, SERVER_URL, col, { username: 'bob', password: 'pw' }, cfg);

    await Promise.all([offerer.connect(), answerer.connect()]);
    answerer.negotiate(offerer.userId!);
    await new Promise((r) => setTimeout(r, 100));
    await offerer.negotiate(answerer.userId!);

    expect(offerer.getMetrics().iceEstablishMs.length).toBeGreaterThanOrEqual(1);
    expect(offerer.getMetrics().connectionErrors).toBe(0);

    await Promise.all([offerer.disconnect(), answerer.disconnect()]);
  }, 25000);

  it('startSending increments sent count after successful negotiation', async () => {
    const col = new MetricsCollector();
    const offerer = new WsSignaledWrtcPeer('peer-0', 0, SERVER_URL, col, { username: 'alice', password: 'pw' }, cfg);
    const answerer = new WsSignaledWrtcPeer('peer-1', 1, SERVER_URL, col, { username: 'bob', password: 'pw' }, cfg);

    await Promise.all([offerer.connect(), answerer.connect()]);
    answerer.negotiate(offerer.userId!);
    await new Promise((r) => setTimeout(r, 100));
    await offerer.negotiate(answerer.userId!);

    offerer.startSending(10);
    answerer.startSending(10);
    await new Promise((r) => setTimeout(r, 500));
    offerer.stopSending();
    answerer.stopSending();

    expect(offerer.getMetrics().sent).toBeGreaterThan(0);

    await Promise.all([offerer.disconnect(), answerer.disconnect()]);
  }, 25000);

  it('connect() rejects when server is unreachable, incrementing connectionErrors', async () => {
    const col = new MetricsCollector();
    const peer = new WsSignaledWrtcPeer('peer-0', 0, 'http://127.0.0.1:19997', col, { username: 'p0', password: 'pw' }, cfg);
    await expect(peer.connect()).rejects.toThrow();
    expect(peer.getMetrics().connectionErrors).toBe(1);
    await peer.disconnect();
  }, 10000);
});
```

- [ ] **Step 4.2: Run to confirm they fail**

```bash
npx jest tests/peers/ws-signaled-wrtc-peer.test.ts --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 4.3: Create `src/peers/ws-signaled-wrtc-peer.ts`**

```typescript
import WebSocket from 'ws';
import nodeDatachannel, { Audio, Video } from 'node-datachannel';
import type { DataChannel, Track } from 'node-datachannel';
import {
  fetchJwt,
  buildWsUrl,
  decodeToken,
  isPong,
  buildWsSignalMessage,
  isWsSignalMessage,
} from '../protocol/ws-protocol';
import { SignalMessage } from '../protocol/tcp-protocol';
import { BasePeer, PeerMetrics, emptyMetrics } from './base-peer';
import { MetricsCollector } from '../metrics/collector';
import { WebrtcConfig } from '../orchestrator/test-config';
import { buildRtpPacket, buildVideoRtpPacket } from './rtp-utils';

export class WsSignaledWrtcPeer implements BasePeer {
  readonly peerId: string;
  readonly peerIndex: number;

  private ws?: WebSocket;
  private myUserId?: string;
  private partnerUserId?: string;
  private iceStartMs = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pc: any = null;
  private dc: DataChannel | null = null;

  private audioTrack: Track | null = null;
  private audioTimer: NodeJS.Timeout | null = null;
  private rtpSeq = 0;
  private rtpTimestamp = 0;
  private readonly rtpSsrc = Math.floor(Math.random() * 0xffffffff);

  private videoTrack: Track | null = null;
  private videoTimer: NodeJS.Timeout | null = null;
  private videoSeq = 0;
  private videoTimestamp = 0;
  private readonly videoSsrc = Math.floor(Math.random() * 0xffffffff);

  private sendTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer?: NodeJS.Timeout;
  private seqNo = 0;
  private metrics: PeerMetrics = emptyMetrics();

  constructor(
    peerId: string,
    peerIndex: number,
    private readonly serverUrl: string,
    private readonly collector: MetricsCollector,
    private readonly credentials: { username: string; password: string },
    private readonly config: WebrtcConfig,
  ) {
    this.peerId = peerId;
    this.peerIndex = peerIndex;
  }

  get userId(): string | undefined { return this.myUserId; }
  private get isOfferer(): boolean { return this.peerIndex % 2 === 0; }

  // Login via /auth/token, then open WS. Resolves when WS is open.
  async connect(): Promise<void> {
    const token = await fetchJwt(this.serverUrl, this.credentials.username, this.credentials.password);
    this.myUserId = decodeToken(token).userId;
    const url = buildWsUrl(this.serverUrl, token);
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url);
      const timeout = setTimeout(
        () => reject(new Error(`WS connect timeout: ${this.peerId}`)),
        10000,
      );
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

  // Answerer: registers partner so incoming signals are accepted. Resolves immediately.
  // Offerer: registers partner, creates PC, sends offer via WS. Resolves when ICE connected.
  negotiate(partnerUserId: string): Promise<void> {
    this.partnerUserId = partnerUserId;
    if (!this.isOfferer) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const timeoutMs = this.config.connectionTimeoutMs ?? 15_000;
      let settled = false;
      this.iceStartMs = Date.now();

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.metrics.connectionTimeouts++;
        this.metrics.connectionErrors++;
        this.collector.recordConnectionTimeout();
        this.collector.recordConnectionError();
        resolve();
      }, timeoutMs);

      this.createPc(
        (elapsed) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.metrics.iceEstablishMs.push(elapsed);
          this.collector.recordIceEstablish(this.peerId, elapsed);
          resolve();
        },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.metrics.connectionErrors++;
          this.collector.recordConnectionError();
          resolve();
        },
        this.iceStartMs,
        (msg) => this.sendSignalViaWs(msg),
      );
    });
  }

  private createPc(
    onConnected: (elapsedMs: number) => void,
    onFailed: () => void,
    startMs: number,
    sendSignal: (msg: SignalMessage) => void,
  ): void {
    const iceServers = (this.config.iceServers ?? []).map((s) => s.urls);
    const pc = new nodeDatachannel.PeerConnection(this.peerId, { iceServers });
    this.pc = pc;

    pc.onStateChange((state: string) => {
      if (state === 'connected') onConnected(Date.now() - startMs);
      else if (state === 'failed') onFailed();
    });

    pc.onLocalDescription((sdp: string, type: string) => {
      sendSignal({ type: type as 'offer' | 'answer', sdp });
    });

    pc.onLocalCandidate((candidate: string, mid: string) => {
      sendSignal({ type: 'candidate', candidate, mid });
    });

    if (this.config.media) {
      try {
        const audio = new Audio('audio', 'SendOnly');
        audio.addOpusCodec(111);
        const track = pc.addTrack(audio) as Track;
        this.setupAudioTrack(track);
      } catch { /* media not supported */ }
      if (this.config.media.type === 'audio-video') {
        try {
          const video = new Video('video', 'SendOnly');
          video.addH264Codec(96);
          this.videoTrack = pc.addTrack(video) as Track;
        } catch { /* video not supported */ }
      }
    }

    if (this.isOfferer) {
      const dc = pc.createDataChannel('chat');
      this.setupDataChannel(dc);
    } else {
      pc.onDataChannel((dc: DataChannel) => {
        this.setupDataChannel(dc);
      });
    }
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as unknown;
      if (isPong(msg)) return;
      if (isWsSignalMessage(msg) && msg.data.from === this.partnerUserId) {
        if (!this.isOfferer && !this.pc) {
          // Answerer creates PC on first incoming signal (the offer)
          this.iceStartMs = Date.now();
          this.createPc(
            (elapsed) => {
              this.metrics.iceEstablishMs.push(elapsed);
              this.collector.recordIceEstablish(this.peerId, elapsed);
            },
            () => {
              this.metrics.connectionErrors++;
              this.collector.recordConnectionError();
            },
            this.iceStartMs,
            (signal) => this.sendSignalViaWs(signal),
          );
        }
        this.receiveSignal(msg.data.signal);
      }
    } catch { /* ignore */ }
  }

  private receiveSignal(signal: SignalMessage): void {
    if (!this.pc) return;
    if (signal.type === 'offer' || signal.type === 'answer') {
      this.pc.setRemoteDescription(signal.sdp, signal.type);
    } else if (signal.type === 'candidate') {
      this.pc.addRemoteCandidate(signal.candidate, signal.mid);
    }
  }

  private sendSignalViaWs(signal: SignalMessage): void {
    if (!this.ws || !this.myUserId || !this.partnerUserId) return;
    try {
      this.ws.send(JSON.stringify(buildWsSignalMessage(this.myUserId, this.partnerUserId, signal)));
    } catch { /* ws closed */ }
  }

  private setupDataChannel(dc: DataChannel): void {
    this.dc = dc;
    dc.onMessage((msg: string | ArrayBuffer | Buffer) => {
      const raw = typeof msg === 'string' ? msg : Buffer.from(msg as ArrayBuffer).toString();
      if (raw.startsWith('MSG:')) {
        const parts = raw.split(':');
        if (dc.isOpen()) dc.sendMessage(`ACK:${parts[1]}:${parts[2]}`);
      } else if (raw.startsWith('ACK:')) {
        const parts = raw.split(':');
        const sentAt = parseInt(parts[2], 10);
        const latencyMs = Date.now() - sentAt;
        this.metrics.acked++;
        this.metrics.writeLatencySamples.push(latencyMs);
        this.collector.recordAcked(this.peerId, sentAt, latencyMs);
      }
    });
  }

  private setupAudioTrack(track: Track): void {
    this.audioTrack = track;
    const startMs = Date.now();
    track.onOpen(() => {
      const elapsed = Date.now() - startMs;
      this.metrics.mediaEstablishMs.push(elapsed);
      this.collector.recordMediaEstablish(this.peerId, elapsed);
    });
  }

  startSending(msgPerSec: number): void {
    const intervalMs = Math.max(10, Math.floor(1_000 / msgPerSec));
    this.sendTimer = setInterval(() => {
      if (!this.dc?.isOpen()) return;
      const sentAt = Date.now();
      const ok = this.dc.sendMessage(`MSG:${this.seqNo++}:${sentAt}`);
      if (ok) {
        this.metrics.sent++;
        this.collector.recordSent(this.peerId, sentAt);
      } else {
        this.metrics.dropped++;
        this.collector.recordDropped(this.peerId);
      }
    }, intervalMs);

    if (this.audioTrack) {
      this.audioTimer = setInterval(() => {
        try {
          const packet = buildRtpPacket(this.rtpSeq++, this.rtpTimestamp, this.rtpSsrc);
          this.rtpTimestamp += 960;
          const ok = this.audioTrack?.sendMessageBinary(packet) ?? false;
          if (ok) { this.metrics.rtpPacketsSent++; this.collector.recordRtpSent(this.peerId); }
          else { this.metrics.rtpPacketsLost++; this.collector.recordRtpLost(this.peerId); }
        } catch { /* track closed */ }
      }, 20);
    }

    if (this.videoTrack) {
      const bitrate = this.config.media?.bitrate ?? 1000;
      const bytesPerFrame = Math.floor((bitrate * 1000) / 8 / 30);
      this.videoTimer = setInterval(() => {
        try {
          const packet = buildVideoRtpPacket(this.videoSeq++, this.videoTimestamp, this.videoSsrc, bytesPerFrame);
          this.videoTimestamp += 3000;
          const ok = this.videoTrack?.sendMessageBinary(packet) ?? false;
          if (ok) { this.metrics.rtpPacketsSent++; this.collector.recordRtpSent(this.peerId); }
          else { this.metrics.rtpPacketsLost++; this.collector.recordRtpLost(this.peerId); }
        } catch { /* track closed */ }
      }, 33);
    }
  }

  stopSending(): void {
    if (this.sendTimer !== null) { clearInterval(this.sendTimer); this.sendTimer = null; }
    if (this.audioTimer !== null) { clearInterval(this.audioTimer); this.audioTimer = null; }
    if (this.videoTimer !== null) { clearInterval(this.videoTimer); this.videoTimer = null; }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN)
        this.ws.send(JSON.stringify({ type: 'ping' }));
    }, 15000);
  }

  async disconnect(): Promise<void> {
    this.stopSending();
    clearInterval(this.heartbeatTimer);
    try { this.dc?.close(); } catch { /* ignore */ }
    try { this.audioTrack?.close(); } catch { /* ignore */ }
    try { this.videoTrack?.close(); } catch { /* ignore */ }
    this.audioTrack = null;
    this.videoTrack = null;
    this.dc = null;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 200);
      try { this.pc?.close(); } catch { /* ignore */ }
    });
    this.pc = null;
    if (this.ws) {
      this.ws.close(1000, 'stress_test_done');
      await new Promise<void>((res) => {
        this.ws?.once('close', () => res());
        setTimeout(res, 2000);
      });
    }
  }

  getMetrics(): PeerMetrics {
    return {
      ...this.metrics,
      writeLatencySamples: [...this.metrics.writeLatencySamples],
      iceEstablishMs: [...this.metrics.iceEstablishMs],
      mediaEstablishMs: [...this.metrics.mediaEstablishMs],
    };
  }
}
```

- [ ] **Step 4.4: Run tests**

```bash
npx jest tests/peers/ws-signaled-wrtc-peer.test.ts --no-coverage
```

Expected: all PASS.

- [ ] **Step 4.5: Typecheck**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4.6: Commit**

```bash
git add src/peers/ws-signaled-wrtc-peer.ts \
        tests/peers/ws-signaled-wrtc-peer.test.ts
git commit -m "feat(stress-test): add WsSignaledWrtcPeer — WebRTC signaled via WS server relay"
```

---

## Task 5: Orchestrator Integration

**Files:**
- Modify: `src/orchestrator/orchestrator.ts`

- [ ] **Step 5.1: Add imports to `orchestrator.ts`**

Add these imports at the top of `src/orchestrator/orchestrator.ts` (after existing peer imports):

```typescript
import { TcpSignaledWrtcPeer } from "../peers/tcp-signaled-wrtc-peer";
import { WsSignaledWrtcPeer } from "../peers/ws-signaled-wrtc-peer";
```

- [ ] **Step 5.2: Fix the legacy-mode guard to exclude new modes**

In `orchestrator.ts`, replace:

```typescript
if (this.config.mode !== "webrtc")
```

With:

```typescript
if (
  this.config.mode === "lan" ||
  this.config.mode === "ws" ||
  this.config.mode === "both"
)
```

- [ ] **Step 5.3: Add `tcp-signaled` branch to `run()`**

In `orchestrator.ts`, after the closing `}` of the `if (this.config.mode === "webrtc")` block and before the `formatIperfComparison` call, add:

```typescript
    if (this.config.mode === "tcp-signaled") {
      const iperfTarget = this.config.lan?.iperfTargetIp || this.config.lan?.hostIp;
      const iperfBaseline = await this.measureBaseline(iperfTarget);
      for (const phase of this.config.phases) {
        this.collector.reset();
        this.sampler.reset();
        const peers = this.createTcpSignaledPeers(phase);

        await Promise.allSettled(peers.map((p) => p.connect()));

        const offerers = peers.filter((_, i) => i % 2 === 0) as TcpSignaledWrtcPeer[];
        const pairResults = await Promise.allSettled(
          offerers.map((p, pi) =>
            p.connectTo("127.0.0.1", (peers[pi * 2 + 1] as TcpSignaledWrtcPeer).port)
          )
        );
        const failedPairs = pairResults.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected"
        );
        if (failedPairs.length > 0) {
          console.error(
            `  [Error] ${failedPairs.length} TCP-signaled pairs failed to connect`
          );
        }

        const connected = peers.filter((p) => p.getMetrics().connectionErrors === 0).length;
        console.log(
          `\n[tcp-signaled] phase: ${phase.peerCount} peers, ${phase.peerCount / 2} pairs, ${connected}/${peers.length} connected`
        );

        const iperfPromise = this.startIperf(phase, iperfTarget);

        await sleep(500);
        const startMs = Date.now();
        this.sampler.start();
        peers.forEach((p) => p.startSending(phase.msgPerSec));
        await sleep(phase.durationSec * 1000);
        peers.forEach((p) => p.stopSending());
        this.sampler.stop();
        const endMs = Date.now();

        const iperfLoad = await this.awaitIperf(iperfPromise);
        await Promise.allSettled(peers.map((p) => p.disconnect()));

        const phaseName = `tcp-sig-${phase.peerCount}p${
          phase.iperfLoadMbps && iperfTarget ? `-iperf${phase.iperfLoadMbps}M` : ""
        }`;
        const netStats = computeNetworkStats(this.sampler.getSamples(), endMs - startMs);
        const msgStats = this.collector.computeStats(
          phaseName, phase.peerCount, phase.msgPerSec, phase.durationSec, startMs, endMs
        );
        const stats: PhaseStats = {
          ...msgStats,
          throughputMbps: netStats.throughputMbps,
          packetLossPercent: netStats.packetLossPercent,
          rssiDbm: netStats.rssiDbm,
          linkSpeedMbps: netStats.linkSpeedMbps,
          iperfBaseline,
          iperfLoad,
        };
        printPhaseStats(stats);
        console.log(formatWebrtcBlock(stats, phase.peerCount));
        results.push(stats);
      }
    }
```

- [ ] **Step 5.4: Add `ws-signaled` branch to `run()`**

Directly after the `tcp-signaled` block, add:

```typescript
    if (this.config.mode === "ws-signaled") {
      const iperfTarget = this.config.webrtc?.iperfTargetIp;
      const iperfBaseline = await this.measureBaseline(iperfTarget);
      for (const phase of this.config.phases) {
        this.collector.reset();
        this.sampler.reset();
        const peers = this.createWsSignaledPeers(phase) as WsSignaledWrtcPeer[];

        const connectResults = await Promise.allSettled(peers.map((p) => p.connect()));
        const failedConnects = connectResults.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected"
        );
        if (failedConnects.length > 0) {
          console.error(
            `  [Error] ${failedConnects.length} peers failed to connect to WS server`
          );
          for (const f of failedConnects)
            console.error(`    - ${describeConnectError(f.reason)}`);
        }

        // Register answerers first so they're ready when the offer arrives
        for (let i = 1; i < peers.length; i += 2) {
          const offererId = peers[i - 1].userId;
          if (offererId) peers[i].negotiate(offererId);
        }
        await sleep(100);

        // Trigger offerers and await ICE establishment
        const iceResults = await Promise.allSettled(
          peers
            .filter((_, i) => i % 2 === 0)
            .map((p, pi) => {
              const answererId = peers[pi * 2 + 1].userId;
              return answererId ? p.negotiate(answererId) : Promise.resolve();
            })
        );
        const failedIce = iceResults.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected"
        );
        if (failedIce.length > 0) {
          console.error(`  [Error] ${failedIce.length} WS-signaled pairs failed ICE`);
        }

        const connected = peers.filter((p) => p.getMetrics().connectionErrors === 0).length;
        console.log(
          `\n[ws-signaled] phase: ${phase.peerCount} peers, ${phase.peerCount / 2} pairs, ${connected}/${peers.length} connected`
        );

        const iperfPromise = this.startIperf(phase, iperfTarget);

        await sleep(500);
        const startMs = Date.now();
        this.sampler.start();
        peers.forEach((p) => p.startSending(phase.msgPerSec));
        await sleep(phase.durationSec * 1000);
        peers.forEach((p) => p.stopSending());
        this.sampler.stop();
        const endMs = Date.now();

        const iperfLoad = await this.awaitIperf(iperfPromise);
        await Promise.allSettled(peers.map((p) => p.disconnect()));

        const phaseName = `ws-sig-${phase.peerCount}p${
          phase.iperfLoadMbps && iperfTarget ? `-iperf${phase.iperfLoadMbps}M` : ""
        }`;
        const netStats = computeNetworkStats(this.sampler.getSamples(), endMs - startMs);
        const msgStats = this.collector.computeStats(
          phaseName, phase.peerCount, phase.msgPerSec, phase.durationSec, startMs, endMs
        );
        const stats: PhaseStats = {
          ...msgStats,
          throughputMbps: netStats.throughputMbps,
          packetLossPercent: netStats.packetLossPercent,
          rssiDbm: netStats.rssiDbm,
          linkSpeedMbps: netStats.linkSpeedMbps,
          iperfBaseline,
          iperfLoad,
        };
        printPhaseStats(stats);
        console.log(formatWebrtcBlock(stats, phase.peerCount));
        results.push(stats);
      }
    }
```

- [ ] **Step 5.5: Add factory methods to `Orchestrator` class**

Add after `createWebrtcPeers` (before the closing `}` of the class):

```typescript
  private createTcpSignaledPeers(phase: Phase): TcpSignaledWrtcPeer[] {
    const lan = this.config.lan!;
    return Array.from(
      { length: phase.peerCount },
      (_, i) =>
        new TcpSignaledWrtcPeer(
          `stress-tcp-sig-${i}`,
          i,
          lan.hostIp,
          lan.startPort + i,
          this.collector,
          this.config.webrtc!
        )
    );
  }

  private createWsSignaledPeers(phase: Phase): WsSignaledWrtcPeer[] {
    const ws = this.config.ws!;
    return Array.from(
      { length: phase.peerCount },
      (_, i) =>
        new WsSignaledWrtcPeer(
          `${ws.accountPrefix}${i}`,
          i,
          ws.serverUrl,
          this.collector,
          { username: `${ws.accountPrefix}${i}`, password: ws.password },
          this.config.webrtc!
        )
    );
  }
```

- [ ] **Step 5.6: Run full test suite**

```bash
npm test
```

Expected: all tests PASS. No regressions in existing webrtc, lan, ws tests.

- [ ] **Step 5.7: Typecheck**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 5.8: Commit**

```bash
git add src/orchestrator/orchestrator.ts
git commit -m "feat(stress-test): wire tcp-signaled and ws-signaled modes into Orchestrator"
```

---

## Task 6: Example Configs

**Files:**
- Create: `stress-test.tcp-signaled.config.json`
- Create: `stress-test.ws-signaled.config.json`

- [ ] **Step 6.1: Create `stress-test.tcp-signaled.config.json`**

Replace `192.168.1.23` with your laptop's LAN IP before running.

```json
{
  "mode": "tcp-signaled",
  "lan": {
    "hostIp": "192.168.1.23",
    "startPort": 9100
  },
  "webrtc": {
    "connectionTimeoutMs": 15000,
    "media": { "type": "audio-video", "bitrate": 500 }
  },
  "phases": [
    { "peerCount": 2,  "msgPerSec": 5, "durationSec": 20 },
    { "peerCount": 10, "msgPerSec": 5, "durationSec": 30 },
    { "peerCount": 50, "msgPerSec": 5, "durationSec": 30 }
  ],
  "outputDir": "./stress-results"
}
```

- [ ] **Step 6.2: Create `stress-test.ws-signaled.config.json`**

Replace IPs and credentials to match your server.

```json
{
  "mode": "ws-signaled",
  "ws": {
    "serverUrl": "https://192.168.1.23",
    "accountPrefix": "stress_peer_",
    "password": "StressTest@123",
    "iperfTargetIp": "192.168.1.23"
  },
  "webrtc": {
    "connectionTimeoutMs": 20000,
    "media": { "type": "audio-video", "bitrate": 500 },
    "iperfTargetIp": "192.168.1.23"
  },
  "phases": [
    { "peerCount": 2,  "msgPerSec": 5, "durationSec": 20 },
    { "peerCount": 10, "msgPerSec": 5, "durationSec": 30 },
    { "peerCount": 50, "msgPerSec": 5, "durationSec": 30 }
  ],
  "outputDir": "./stress-results"
}
```

- [ ] **Step 6.3: Smoke-test TCP-signaled mode locally (no phone needed)**

```bash
npx ts-node src/runner.ts --mode tcp-signaled \
  --config stress-test.tcp-signaled.config.json
```

Expected: ICE establishes for each pair, `iceEstablishMs` printed in the WebRTC block, delivery rate table shows data channel messages flowing.

- [ ] **Step 6.4: Commit**

```bash
git add stress-test.tcp-signaled.config.json stress-test.ws-signaled.config.json
git commit -m "feat(stress-test): add tcp-signaled and ws-signaled example configs"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] `SignalMessage` moved to protocol layer — Task 1
- [x] `TcpSignalPayload` for NaCl-encrypted signal frames — Task 1
- [x] `WsSignalMessage` for WS-relayed signal frames — Task 1
- [x] `tcp-signaled` and `ws-signaled` in mode union + validation — Task 2
- [x] `rtp-utils.ts` extracted, no RTP duplication across peer files — Task 2
- [x] `TcpSignaledWrtcPeer` — TCP handshake + WebRTC ICE — Task 3
- [x] `WsSignaledWrtcPeer` — JWT auth + WS relay + WebRTC ICE — Task 4
- [x] Orchestrator strict-pair wiring, legacy-mode guard fixed — Task 5
- [x] Example configs — Task 6

**Type consistency check:**
- `buildTcpSignalPayload` defined Task 1, used Task 3 ✓
- `isTcpSignalPayload` defined Task 1, used Task 3 ✓
- `buildWsSignalMessage` / `isWsSignalMessage` defined Task 1, used Task 4 ✓
- `TcpSignaledWrtcPeer.connectTo(host, port)` used in Task 5 — matches Task 3 signature ✓
- `TcpSignaledWrtcPeer.port` getter used in Task 5 — defined in Task 3 ✓
- `WsSignaledWrtcPeer.negotiate(partnerUserId)` used in Task 5 — matches Task 4 signature ✓
- `WsSignaledWrtcPeer.userId` getter used in Task 5 — matches Task 4 definition ✓
- `buildRtpPacket` / `buildVideoRtpPacket` defined in Task 2, imported in Tasks 3 and 4 ✓
