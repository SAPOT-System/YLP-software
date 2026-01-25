import TcpSocket from "react-native-tcp-socket";
import EventEmitter from "events";
import { TcpDataMessage } from "../types";

export class TcpClientAdapter extends EventEmitter {
  private socket?: TcpSocket.Socket;
  private connectionState: "disconnected" | "connecting" | "connected" =
    "disconnected";
  readonly peerId: string;

  constructor(peerId: string) {
    super();
    this.peerId = peerId;
  }

  connect(host: string, port: number) {
    return new Promise<void>((resolve, reject) => {
      try {
        console.log(
          `[TcpClientAdapter]: Trying to connect to the client: ${host}:${port}`
        );

        this.connectionState = "connecting";

        const socket = TcpSocket.createConnection(
          {
            host: host,
            port: port,
          },
          () => {
            console.log("[TcpClientAdapter]: TCP connected");
            this.socket = socket;
            this.connectionState = "connected";
            resolve();
          }
        );

        const onError = (error: any) => {
          console.error(
            "[TcpClientAdapter]: Error on connection client:",
            error
          );
          this.connectionState = "disconnected";
          reject(error);
        };

        const onClose = () => {
          console.log("[TcpClientAdapter]: TCP connection closed");
          this.connectionState = "disconnected";
          this.socket = undefined;
        };

        socket.on("error", onError);
        socket.on("close", onClose);
      } catch (error) {
        console.error(
          `[TcpClientAdapter]: Error connecting\n${JSON.stringify({
            host: host,
            port: port,
          })}\n${error}`
        );
        this.socket = undefined;
        throw error;
      }
    });
  }

  sendMessage(message: TcpDataMessage) {
    if (!this.socket) throw new Error("TCP not connected");
    try {
      const data = JSON.stringify(message) + "\n";
      this.socket.write(data);
    } catch (error) {
      console.error(
        `[TcpClientAdapter]: Error sending message\n${JSON.stringify({
          message: message,
        })}\n${error}`
      );
      throw error;
    }
  }

  disconnect() {
    try {
      this.socket?.destroy();
      this.socket = undefined;
    } catch (error) {
      console.error("[TcpClientAdapter]: Error socket disconnecting:", error);
      throw error;
    }
  }

  get isConnected() {
    try {
      return this.connectionState === "connected";
    } catch (error) {
      console.error(
        "[TcpClientAdapter]: Error getting if tcp is connected:",
        error
      );
    }
  }
}
