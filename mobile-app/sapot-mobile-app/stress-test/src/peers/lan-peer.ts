import net from "net";
import type { CiaoService } from "@homebridge/ciao";
import { encodeBase64 } from "tweetnacl-util";
import {
  generateKeyPair,
  computeSharedKey,
  encryptMessage,
  decryptMessage,
  buildHandshakeAck,
  parsePublicKey,
  EncryptedEnvelope,
} from "../protocol/tcp-protocol";
import { BasePeer, PeerMetrics, emptyMetrics } from "./base-peer";
import { MetricsCollector } from "../metrics/collector";

export class LanPeer implements BasePeer {
  readonly peerId: string;
  readonly peerIndex: number;
  private _port: number;
  private server: net.Server;
  private serverSocket?: net.Socket;
  private serverSharedKey?: Uint8Array;
  private serverHandshakeDone = false;
  private serverReceiveBuffer = "";
  private clientSocket?: net.Socket;
  private clientSharedKey?: Uint8Array;
  private clientHandshakeDone = false;
  private metrics: PeerMetrics = emptyMetrics();
  private sendTimer?: NodeJS.Timeout;
  private mdnsService?: CiaoService;

  constructor(
    peerId: string,
    peerIndex: number,
    private readonly hostIp: string,
    port: number,
    private readonly collector: MetricsCollector
  ) {
    this.peerId = peerId;
    this.peerIndex = peerIndex;
    this._port = port;
    this.server = net.createServer();
  }

  get port(): number {
    return this._port;
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.server.off("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        this.server.off("error", onError);
        const addr = this.server.address();
        if (addr && typeof addr === "object") {
          this._port = addr.port;
        }
        resolve();
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(this._port, "0.0.0.0");
    });

    this.server.on("connection", (socket) => {
      this.serverSocket = socket;
      const kp = generateKeyPair();
      this.serverReceiveBuffer = "";
      this.serverHandshakeDone = false;

      socket.on("data", (raw) => {
        this.serverReceiveBuffer += raw.toString("utf8");
        const lines = this.serverReceiveBuffer.split("\n");
        this.serverReceiveBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const frame = JSON.parse(line) as Record<string, unknown>;
            if (!this.serverHandshakeDone) {
              if (frame["type"] !== "handshake-init") return;
              this.serverSharedKey = computeSharedKey(
                kp.secretKey,
                parsePublicKey(frame["pub"] as string)
              );
              socket.write(
                JSON.stringify(buildHandshakeAck(kp.publicKey)) + "\n"
              );
              this.serverHandshakeDone = true;
            } else if (frame["type"] === "encrypted" && this.serverSharedKey) {
              decryptMessage(
                this.serverSharedKey,
                frame as unknown as EncryptedEnvelope
              );
            }
          } catch {
            /* malformed frame */
          }
        }
      });

      socket.on("error", () => {
        this.metrics.connectionErrors++;
        this.collector.recordConnectionError();
      });
      socket.on("close", () => {
        this.serverSocket = undefined;
        this.serverHandshakeDone = false;
        this.serverSharedKey = undefined;
      });
    });

    void this.advertiseMdns();

  }

  async connectTo(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const kp = generateKeyPair();
      let buf = "";
      const socket = net.createConnection({ host, port }, () => {
        socket.write(
          JSON.stringify({ type: "handshake-init", pub: encodeBase64(kp.publicKey) }) + "\n"
        );
      });
      socket.on("data", (raw) => {
        buf += raw.toString("utf8");
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const frame = JSON.parse(line) as Record<string, unknown>;
            if (frame["type"] === "handshake-ack" && !this.clientHandshakeDone) {
              this.clientSharedKey = computeSharedKey(
                kp.secretKey,
                parsePublicKey(frame["pub"] as string)
              );
              this.clientHandshakeDone = true;
              this.clientSocket = socket;
              resolve();
            }
          } catch {
            /* malformed frame */
          }
        }
      });
      socket.on("error", (err) => {
        this.metrics.connectionErrors++;
        this.collector.recordConnectionError();
        reject(err);
      });
      socket.on("close", () => {
        this.clientSocket = undefined;
        this.clientHandshakeDone = false;
        this.clientSharedKey = undefined;
      });
      setTimeout(
        () => reject(new Error(`LAN handshake timeout to ${host}:${port}`)),
        5000
      );
    });
  }

  private async advertiseMdns(): Promise<void> {
    try {
      const { getResponder, Protocol } = await import("@homebridge/ciao");
      const responder = getResponder({ interface: this.hostIp });
      this.mdnsService = responder.createService({
        name: this.peerId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: "lanchat" as any,
        protocol: Protocol.TCP,
        port: this._port,
        restrictedAddresses: [this.hostIp],
        disabledIpv6: true,
        txt: {
          id: this.peerId,
          username: this.peerId,
          firstName: "Stress",
          lastName: String(this.peerIndex),
          peerId: this.peerId,
        },
      });
      await this.mdnsService.advertise();
    } catch {
      /* mDNS unavailable in test/CI environments — non-fatal */
    }
  }

  startSending(msgPerSec: number): void {
    const intervalMs = Math.max(10, Math.floor(1000 / msgPerSec));
    this.sendTimer = setInterval(() => {
      if (!this.clientSocket || !this.clientSharedKey || !this.clientHandshakeDone) return;
      const sentAt = Date.now();
      try {
        const envelope = encryptMessage(this.clientSharedKey, {
          type: "stress-chat",
          from: this.peerId,
          ts: sentAt,
          seq: this.metrics.sent,
        });
        const writeStart = Date.now();
        const flushed = this.clientSocket.write(JSON.stringify(envelope) + "\n");
        const recordLatency = (latency: number) => {
          this.metrics.writeLatencySamples.push(latency);
          this.metrics.acked++;
          this.collector.recordAcked(this.peerId, sentAt, latency);
        };
        if (flushed) {
          recordLatency(Date.now() - writeStart);
        } else {
          this.clientSocket.once("drain", () =>
            recordLatency(Date.now() - writeStart)
          );
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
    this.clientSocket?.destroy();
    this.serverSocket?.destroy();

    if (this.mdnsService) {
      try {
        await Promise.race([
          this.mdnsService.end(),
          new Promise<void>(res => setTimeout(res, 500)),
        ]);
      } catch { /* ignore */ }
      this.mdnsService = undefined;
    }

    await Promise.race([
      new Promise<void>((res) => this.server.close(() => res())),
      new Promise<void>((res) => setTimeout(res, 500)),
    ]);
  }

  getMetrics(): PeerMetrics {
    return { ...this.metrics };
  }
}
