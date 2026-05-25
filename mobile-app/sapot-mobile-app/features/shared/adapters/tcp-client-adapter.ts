import EventEmitter from "events";
import TcpSocket from "react-native-tcp-socket";
import { Message } from "../types";
import { tcpLog } from "../utils/logger";
import {
  generateKeyPair,
  computeSharedKey,
  encryptMessage,
  decryptMessage,
  buildHandshakeInit,
  parsePublicKey,
} from "../services/tcp-encryption";

export class TcpClientAdapter extends EventEmitter {
  private socket?: TcpSocket.Socket;
  private connectionState: "disconnected" | "connecting" | "connected" =
    "disconnected";
  private sharedKey?: Uint8Array;
  private receiveBuffer = "";
  readonly peerId: string;

  constructor(peerId: string) {
    super();
    this.peerId = peerId;
  }

  connect(host: string, port: number) {
    return new Promise<void>((resolve, reject) => {
      try {
        this.connectionState = "connecting";
        this.sharedKey = undefined;
        this.receiveBuffer = "";

        const keyPair = generateKeyPair();
        let handshakeDone = false;

        const socket = TcpSocket.createConnection({ host, port }, () => {
          this.socket = socket;
          const initMsg =
            JSON.stringify(buildHandshakeInit(keyPair.publicKey)) + "\n";
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
        this.emit("data", message);
      } catch (error) {
        tcpLog.error("tcp › decrypt failed", { error });
      }
    }
  }

  sendMessage(message: Message) {
    if (!this.socket) throw new Error("TCP not connected");
    if (!this.sharedKey) throw new Error("TCP handshake not complete");
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
