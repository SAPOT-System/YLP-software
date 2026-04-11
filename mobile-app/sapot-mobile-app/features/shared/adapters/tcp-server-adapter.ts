import { EventEmitter } from "events";
import TcpSocket from "react-native-tcp-socket";
import { tcpLog } from "../utils/logger";

tcpLog.debug("[tcp-server-adapter] module loaded");
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
    tcpLog.info("tcp › server constructed");
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
            tcpLog.debug("tcp › data received");
            const dataStr = typeof data === "string" ? data : data.toString();
            buffer += dataStr;

            const messages = buffer.split("\n");

            buffer = messages.pop() || "";

            for (const messageStr of messages) {
              if (!messageStr.trim()) continue;
              // tcpLog.debug("tcp › message buffer", { hasMessage: true });
              let message;
              try {
                message = JSON.parse(messageStr);
                this.emit("data", message);
              } catch (error) {
                tcpLog.error("tcp › parse failed", { error });
              }
            }
          });

          socket.on("close", () => {
            tcpLog.info("tcp › client disconnected");
          });

          socket.on("error", (error) => {
            tcpLog.error("tcp › client error", { error });
          });
        });

        this.server?.listen({ port, host: "0.0.0.0" }, () => {
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
      tcpLog.error("tcp › stop failed", { error });
      throw error;
    }
  }
}
