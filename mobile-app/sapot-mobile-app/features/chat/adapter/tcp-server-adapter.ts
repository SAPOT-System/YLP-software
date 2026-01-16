import TcpSocket from "react-native-tcp-socket";
import { EventEmitter } from "events";
export class TcpServerAdapter extends EventEmitter {
  private server?: TcpSocket.Server;

  constructor() {
    super();
  }

  start(port: number) {
    return new Promise<void>((resolve, reject) => {
      // TODO: store the socket connection
      this.server = TcpSocket.createServer((socket) => {
        socket.on("data", (data) => {
          console.log("[TcpServerAdapter]: Data recieved:", data);
          this.emit("data", data);
        });

        socket.on("close", () => {
          console.log("Client disconnected");
        });

        socket.on("error", (error) => {
          console.error("Client error");
        });
      });

      this.server?.listen({ port, host: "0.0.0.0" }, () => {
        console.log("TCP Server listening on port", port);
        resolve();
      });

      this.server.on("error", (error) => {
        console.error("TCP server error:", error);
        reject();
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
  }
}
