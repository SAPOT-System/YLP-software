import { EventEmitter } from "events";
import TcpSocket from "react-native-tcp-socket";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import { tcpLog } from "../utils/logger";
import {
  generateKeyPair,
  computeSharedKey,
  decryptMessage,
  parsePublicKey,
} from "../services/tcp-encryption";
import { PeerKeyService } from "../services/peer-key-service";
import { PeerKeyStore } from "../services/peer-key-store";

interface SocketState {
  buffer: string;
  sharedKey?: Uint8Array;
  sessionVerified: boolean;
}

export class TcpServerAdapter extends EventEmitter {
  private server?: TcpSocket.Server;
  private _currentPort?: number;
  private _currentIp?: string;
  private peerKeyService?: PeerKeyService;
  private peerKeyStore?: PeerKeyStore;

  constructor(peerKeyService?: PeerKeyService, peerKeyStore?: PeerKeyStore) {
    super();
    this.peerKeyService = peerKeyService;
    this.peerKeyStore = peerKeyStore;
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
          const state: SocketState = { buffer: "", sessionVerified: false };
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
                  if (frame.credential && this.peerKeyService) {
                    const valid = this.peerKeyService.verifyPeerCredential(frame.credential);
                    if (!valid) {
                      tcpLog.warn("tcp › peer credential verification failed, dropping connection");
                      socket.destroy();
                      return;
                    }
                    state.sessionVerified = true;
                    if (this.peerKeyStore && frame.credential.ecdhPublicKey) {
                      this.peerKeyStore.set(frame.credential.peerId, decodeBase64(frame.credential.ecdhPublicKey));
                    }
                  } else {
                    // Client sent no credential. Credential exchange is opportunistic:
                    // a guest peer or an uninitialized peer legitimately has none.
                    // The session is still ECDH-encrypted, so allow it.
                    state.sessionVerified = true;
                  }
                  // Store the client's stable app-level ECDH public key so ChatService
                  // can derive conversation keys without a server round-trip.
                  // frame.userId is the client's own user ID (sent alongside appPub).
                  if (frame.appPub && frame.userId && this.peerKeyStore) {
                    this.peerKeyStore.set(frame.userId as string, decodeBase64(frame.appPub as string));
                    tcpLog.debug("tcp › peer app key stored from handshake-init", { userId: frame.userId });
                  }
                  const clientPublicKey = parsePublicKey(frame.pub);
                  state.sharedKey = computeSharedKey(serverKeyPair.secretKey, clientPublicKey);
                  const ack: Record<string, unknown> = {
                    type: "handshake-ack",
                    pub: encodeBase64(serverKeyPair.publicKey),
                  };
                  // Credential (non-guest identity verification)
                  const cred = this.peerKeyService?.getCredential();
                  if (cred) ack.credential = cred;
                  // Stable app-level ECDH public key for message encryption
                  const appPub = this.peerKeyService?.getMyPublicKey();
                  if (appPub) ack.appPub = encodeBase64(appPub);
                  socket.write(JSON.stringify(ack) + "\n");
                  return;
                }

                if (frame.type !== "encrypted") {
                  tcpLog.warn("tcp › unexpected unencrypted frame after handshake", { type: frame.type });
                  continue;
                }
                const message = decryptMessage(state.sharedKey, frame);
                if (this.peerKeyService && !state.sessionVerified) {
                  tcpLog.warn("tcp › server data emission blocked: session not verified");
                  continue;
                }
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
