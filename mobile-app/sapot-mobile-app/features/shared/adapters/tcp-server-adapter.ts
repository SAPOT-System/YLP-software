import { EventEmitter } from "events";
import TcpSocket from "react-native-tcp-socket";
/**
 * TcpServerAdapter manages a TCP server socket for accepting peer-to-peer connections.
 * It handles starting, stopping, and emitting data events for incoming messages.
 */
export class TcpServerAdapter extends EventEmitter {
  private server?: TcpSocket.Server;

  /**
   * Constructs a TcpServerAdapter instance.
   */
  constructor() {
    super();
  }

  /**
   * Starts the TCP server and listens for incoming connections on the specified port.
   * Emits 'data' events for each parsed message received.
   * @param port The port to listen on
   * @returns Promise<void> Resolves when server is listening, rejects on error
   */
  start(port: number) {
    return new Promise<void>((resolve, reject) => {
      try {
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
          reject(error);
        });
      } catch (error) {
        console.error(
          `[TcpServerAdapter]: Error starting\n${JSON.stringify(
            { port: port },
            null,
            2
          )}`
        );
        reject(error);
      }
      // TODO: store the socket connection
    });
  }

  /**
   * Stops the TCP server and cleans up resources.
   * @throws Error if stopping fails
   */
  stop() {
    try {
      if (this.server) {
        this.server.close();
        this.server = undefined;
      }
    } catch (error) {
      console.error(
        "[TcpServerAdapter]: Error stopping the tcp server:",
        error
      );
      throw error;
    }
  }
}
