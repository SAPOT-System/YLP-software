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
        let buffer = "";
        socket.on("data", (data) => {
          console.log("[TcpServerAdapter]: Data recieved");
          const dataStr = typeof data === "string" ? data : data.toString();
          buffer += dataStr;

          const messages = buffer.split("\n");

          buffer = messages.pop() || "";

          for (const messageStr of messages) {
            if (!messageStr.trim()) continue;
            // console.log("[TcpServerAdapter]: ", messageStr, typeof messageStr);
            let message;
            try {
              message = JSON.parse(messageStr);
              this.emit("data", message);
            } catch (error) {
              console.error(
                "[TcpServerAdapter]: Failed to parse message:",
                error,
                messageStr
              );
            }
          }
        });

        socket.on("close", () => {
          console.log("[TcpServerAdapter]: Client disconnected");
        });

        socket.on("error", (error) => {
          console.error("[TcpServerAdapter]: Client error:", error);
        });
      });

      this.server?.listen({ port, host: "0.0.0.0" }, () => {
        console.log("[TcpServerAdapter]: TCP Server listening on port", port);
        resolve();
      });

      this.server.on("error", (error) => {
        console.error("[TcpServerAdapter]: TCP server error:", error);
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
