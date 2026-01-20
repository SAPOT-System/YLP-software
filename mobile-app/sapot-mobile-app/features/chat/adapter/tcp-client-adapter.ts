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

        const socket = TcpSocket.createConnection(
          {
            host: host,
            port: port,
          },
          () => {
            console.log("[TcpClientAdapter]: TCP connected");
            this.socket = socket;
            resolve();
          }
        );

        const onError = (error: any) => {
          console.error(
            "[TcpClientAdapter]: Error on connection client:",
            error
          );
          reject(error);
        };

        const onClose = () => {
          console.log("[TcpClientAdapter]: TCP connection closed");
        };

        socket.on("error", onError);
        socket.on("close", onClose);
      } catch (error) {
        console.error("[TcpClientAdapter]: Error connecting to socket:", error);
        this.socket = undefined;
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
