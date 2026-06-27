import EventEmitter from "events";
import TcpSocket from "react-native-tcp-socket";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import { Message } from "../../types";
import { tcpLog } from "../../utils/logger";
import {
  generateKeyPair,
  computeSharedKey,
  encryptMessage,
  decryptMessage,
  parsePublicKey,
} from "../../crypto/tcp-encryption";
import { PeerKeyService } from "../../crypto/peer-key-service";
import { PeerKeyStore } from "../../crypto/peer-key-store";

export class TcpClientAdapter extends EventEmitter {
  private socket?: TcpSocket.Socket;
  private connectionState: "disconnected" | "connecting" | "connected" =
    "disconnected";
  private sharedKey?: Uint8Array;
  private receiveBuffer = "";
  private _sessionVerified = false;
  private _peerIsGuest = true; // conservative default — proven false only by a valid server-signed credential
  readonly peerId: string;
  private readonly myUserId?: string;
  private peerKeyService?: PeerKeyService;
  private peerKeyStore?: PeerKeyStore;

  constructor(
    peerId: string,
    peerKeyService?: PeerKeyService,
    peerKeyStore?: PeerKeyStore,
    myUserId?: string
  ) {
    super();
    this.peerId = peerId;
    this.peerKeyService = peerKeyService;
    this.peerKeyStore = peerKeyStore;
    this.myUserId = myUserId;
  }

  /**
   * Lightweight reachability probe: opens a bare TCP connection (no handshake)
   * and resolves true once connected, false on error or timeout. The socket is
   * always destroyed before resolving. Used by the discovery liveness sweep.
   */
  static probe(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let socket: TcpSocket.Socket | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (reachable: boolean) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try {
          socket?.destroy();
        } catch {
          // best-effort
        }
        resolve(reachable);
      };

      try {
        socket = TcpSocket.createConnection({ host, port }, () => finish(true));
        socket.on("error", () => finish(false));
        timer = setTimeout(() => finish(false), timeoutMs);
      } catch {
        finish(false);
      }
    });
  }

  get sessionVerified(): boolean {
    return this._sessionVerified;
  }

  get peerIsGuest(): boolean {
    return this._peerIsGuest;
  }

  connect(host: string, port: number) {
    return new Promise<void>((resolve, reject) => {
      try {
        this.connectionState = "connecting";
        this.sharedKey = undefined;
        this.receiveBuffer = "";
        this._sessionVerified = false;
        this._peerIsGuest = true;

        const keyPair = generateKeyPair();
        let handshakeDone = false;

        const socket = TcpSocket.createConnection({ host, port }, () => {
          this.socket = socket;
          const initFrame: Record<string, unknown> = {
            type: "handshake-init",
            pub: encodeBase64(keyPair.publicKey),
          };
          // Credential (non-guest identity verification)
          const cred = this.peerKeyService?.getCredential();
          if (cred) initFrame.credential = cred;
          // Stable app-level ECDH public key for message encryption.
          // Present for both guest and non-guest users once peerKeyService is initialized.
          const appPub = this.peerKeyService?.getMyPublicKey();
          if (appPub) initFrame.appPub = encodeBase64(appPub);
          if (this.myUserId) initFrame.userId = this.myUserId;
          const initMsg = JSON.stringify(initFrame) + "\n";
          socket.write(initMsg);
        });

        const onData = (raw: Buffer | string) => {
          this.receiveBuffer +=
            typeof raw === "string" ? raw : raw.toString("utf8");
          const lines = this.receiveBuffer.split("\n");
          this.receiveBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const frame = JSON.parse(line);

              if (!handshakeDone) {
                if (frame.type !== "handshake-ack") {
                  reject(
                    new Error(
                      `TCP handshake: expected handshake-ack, got ${frame.type}`
                    )
                  );
                  socket.destroy();
                  return;
                }
                if (frame.credential && this.peerKeyService) {
                  const valid = this.peerKeyService.verifyPeerCredential(frame.credential);
                  if (!valid) {
                    reject(new Error("TCP handshake: peer credential verification failed"));
                    socket.destroy();
                    return;
                  }
                  this._sessionVerified = true;
                  this._peerIsGuest = false; // valid server-signed credential = authenticated
                  if (this.peerKeyStore && frame.credential.ecdhPublicKey) {
                    this.peerKeyStore.set(frame.credential.peerId, decodeBase64(frame.credential.ecdhPublicKey));
                  }
                } else {
                  // Peer sent no credential — treat as guest. Credential exchange is
                  // opportunistic: guests legitimately have none. The session is still
                  // ECDH-encrypted so allow it; only an explicit verification failure
                  // (handled above with socket.destroy) should block the session.
                  this._sessionVerified = true;
                  this._peerIsGuest = true;
                }
                // Store the peer's stable app-level ECDH public key so ChatService
                // can derive conversation keys without a server round-trip.
                if (frame.appPub && this.peerKeyStore) {
                  this.peerKeyStore.set(this.peerId, decodeBase64(frame.appPub));
                  tcpLog.debug("tcp › peer app key stored from handshake-ack", { peerId: this.peerId });
                }
                const theirPublicKey = parsePublicKey(frame.pub);
                this.sharedKey = computeSharedKey(
                  keyPair.secretKey,
                  theirPublicKey
                );
                handshakeDone = true;
                this.connectionState = "connected";
                socket.off("data", onData);
                socket.on("data", this.handleData.bind(this));
                resolve();
              }
            } catch {
              reject(new Error("TCP handshake parse error"));
              socket.destroy();
            }
          }
        };

        const onError = (error: Error) => {
          tcpLog.error("tcp › connect failed", { error });
          this.connectionState = "disconnected";
          this.sharedKey = undefined;
          reject(error);
        };

        const onClose = () => {
          this.connectionState = "disconnected";
          this.socket = undefined;
          this.sharedKey = undefined;
          this.receiveBuffer = "";
        };

        socket.on("data", onData);
        socket.on("error", onError);
        socket.on("close", onClose);
      } catch (error) {
        tcpLog.error("tcp › connect threw", { error });
        this.socket = undefined;
        throw error;
      }
    });
  }

  private handleData(raw: Buffer | string) {
    this.receiveBuffer += typeof raw === "string" ? raw : raw.toString("utf8");
    const lines = this.receiveBuffer.split("\n");
    this.receiveBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const frame = JSON.parse(line);
        if (frame.type !== "encrypted") {
          tcpLog.warn("tcp › unexpected unencrypted frame after handshake", {
            type: frame.type,
          });
          continue;
        }
        const message = decryptMessage(this.sharedKey!, frame);
        if (this.peerKeyService && !this._sessionVerified) {
          tcpLog.warn("tcp › data emission blocked: session not verified");
          return;
        }
        this.emit("data", message);
      } catch (error) {
        tcpLog.error("tcp › decrypt failed", { error });
      }
    }
  }

  sendMessage(message: Message) {
    if (!this.socket) throw new Error("TCP not connected");
    if (!this.sharedKey) throw new Error("TCP handshake not complete");
    if (this.peerKeyService && !this._sessionVerified) {
      tcpLog.warn("tcp › sendMessage blocked: session not verified", { type: (message as { type?: string }).type });
      throw new Error("TCP session not verified — cannot send message");
    }
    try {
      const envelope = encryptMessage(this.sharedKey, message);
      this.socket.write(JSON.stringify(envelope) + "\n");
    } catch (error) {
      tcpLog.error("tcp › send failed", { type: message.type, error });
      throw error;
    }
  }

  disconnect() {
    try {
      this.socket?.destroy();
      this.socket = undefined;
      this.sharedKey = undefined;
      this.receiveBuffer = "";
    } catch (error) {
      tcpLog.error("tcp › disconnect failed", { error });
      throw error;
    }
  }

  get isConnected() {
    try {
      return this.connectionState === "connected";
    } catch (error) {
      tcpLog.error("tcp › connection state read failed", { error });
      return false;
    }
  }
}
