import TcpSocket from "react-native-tcp-socket";
import EventEmitter from "events";

export class TcpClientAdapter extends EventEmitter {
  private socket?: TcpSocket.Socket;

  constructor() {
    super();
  }

  connect(host: string, port: number) {
    return new Promise<void>((resolve, reject) => {
      try {
        console.log(
          `[TcpClientAdapter]: Trying to connect to the client: ${host}:${port}`
        );

        this.socket = TcpSocket.createConnection(
          {
            host: host,
            port: port,
          },
          () => {
            console.log("[TcpClientAdapter]: TCP connected");
            resolve();
          }
        );

        this.socket.on("error", (error) => {
          console.error(
            "[TcpClientAdapter]: Error on connection client:",
            error
          );
          reject(error);
        });

        this.socket.on("close", () => {
          console.log("[TcpClientAdapter]: TCP connection closed");
        });
      } catch (error) {
        console.error("[TcpClientAdapter]: Error connecting to socket:", error);
        throw error;
      }
    });
  }

  sendMessage(message: any) {
    if (!this.socket) throw new Error("TCP not connected");
    try {
      const data = JSON.stringify(message) + "\n";
      this.socket.write(data);
    } catch (error) {
      console.error("[TcpClientAdapter]: Error sending message:", error);
    }
  }

  disconnect() {
    try {
      this.socket?.destroy();
      this.socket = undefined;
    } catch (error) {
      console.error("[TcpClientAdapter]: Error socket disconnecting:", error);
    }
  }

  get isConnected() {
    return this.socket !== undefined;
  }
}
