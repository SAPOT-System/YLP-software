import { EventEmitter } from "events";
import TcpSocket from "react-native-tcp-socket";
import { tcpLog } from "../utils/logger";
import {
  generateKeyPair,
  computeSharedKey,
  decryptMessage,
  buildHandshakeAck,
  parsePublicKey,
} from "../services/tcp-encryption";

interface SocketState {
  buffer: string;
  sharedKey?: Uint8Array;
}

export class TcpServerAdapter extends EventEmitter {
  private server?: TcpSocket.Server;
  private _currentPort?: number;
  private _currentIp?: string;

  constructor() {
    super();
  }

  get currentPort(): number | undefined {
    return this._currentPort;
  }

  get currentIp(): string | undefined {
    return this._currentIp;
  }

  get isListening(): boolean {
    return !!this.server;
  }

  start(port: number, ip?: string) {
    return new Promise<void>((resolve, reject) => {
      try {
        this.server = TcpSocket.createServer((socket) => {
          const state: SocketState = { buffer: "" };
          const serverKeyPair = generateKeyPair();

          socket.on("data", (data) => {
            state.buffer += typeof data === "string" ? data : data.toString("utf8");
            const lines = state.buffer.split("\n");
            state.buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const frame = JSON.parse(line);

                if (!state.sharedKey) {
                  if (frame.type !== "handshake-init") {
                    tcpLog.warn("tcp › expected handshake-init, dropping connection", { type: frame.type });
                    socket.destroy();
                    return;
                  }
                  const clientPublicKey = parsePublicKey(frame.pub);
                  state.sharedKey = computeSharedKey(serverKeyPair.secretKey, clientPublicKey);
                  const ack = JSON.stringify(buildHandshakeAck(serverKeyPair.publicKey)) + "\n";
                  socket.write(ack);
                  return;
                }

                if (frame.type !== "encrypted") {
                  tcpLog.warn("tcp › unexpected unencrypted frame after handshake", { type: frame.type });
                  continue;
                }
                const message = decryptMessage(state.sharedKey, frame);
                this.emit("data", message);
              } catch (error) {
                tcpLog.error("tcp › frame error", { error });
              }
            }
          });

          socket.on("close", () => {
            // no-op: connection lifecycle managed by ConnectionService
          });

          socket.on("error", (error) => {
            tcpLog.error("tcp › client error", { error });
          });
        });

        this.server?.listen({ port, host: "0.0.0.0" }, () => {
          this._currentPort = port;
          this._currentIp = ip;
          tcpLog.info("tcp › server listening", { port });
          resolve();
        });

        this.server.on("error", (error) => {
          tcpLog.error("tcp › server error", { error });
          reject(error);
        });
      } catch (error) {
        tcpLog.error("tcp › start failed", { port, error });
        reject(error);
      }
    });
  }

  stop() {
    try {
      if (this.server) {
        this.server.close();
        this.server = undefined;
        this._currentPort = undefined;
        this._currentIp = undefined;
      }
    } catch (error) {
      tcpLog.error("tcp › stop failed", { error });
      throw error;
    }
  }
}
