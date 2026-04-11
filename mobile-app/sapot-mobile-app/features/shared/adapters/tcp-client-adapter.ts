import EventEmitter from "events";
import TcpSocket from "react-native-tcp-socket";
import { Message } from "../types";
import baseLogger from "../utils/logger";

const tcpLog = baseLogger.extend("tcp");

/**
 * TcpClientAdapter manages a TCP client socket connection for peer-to-peer communication.
 * It handles connecting, sending messages, disconnecting, and connection state management.
 */
export class TcpClientAdapter extends EventEmitter {
  private socket?: TcpSocket.Socket;
  private connectionState: "disconnected" | "connecting" | "connected" =
    "disconnected";
  readonly peerId: string;

  /**
   * Constructs a TcpClientAdapter instance for a given peer.
   * @param peerId The peer id this client will connect to
   */
  constructor(peerId: string) {
    super();
    this.peerId = peerId;
  }

  /**
   * Connects to a TCP server at the specified host and port.
   * @param host The server host
   * @param port The server port
   * @returns Promise<void> Resolves when connected, rejects on error
   */
  connect(host: string, port: number) {
    return new Promise<void>((resolve, reject) => {
      try {
        tcpLog.info("tcp › connect start", {
          hasHost: Boolean(host),
          hasPort: Boolean(port),
        });

        this.connectionState = "connecting";

        const socket = TcpSocket.createConnection(
          {
            host: host,
            port: port,
          },
          () => {
            tcpLog.info("tcp › connected");
            this.socket = socket;
            this.connectionState = "connected";
            resolve();
          }
        );

        const onError = (error: Error) => {
          tcpLog.warn("tcp › connect failed", { error });
          this.connectionState = "disconnected";
          reject(error);
        };

        const onClose = () => {
          tcpLog.info("tcp › connection closed");
          this.connectionState = "disconnected";
          this.socket = undefined;
        };

        socket.on("error", onError);
        socket.on("close", onClose);
      } catch (error) {
        tcpLog.warn("tcp › connect threw", {
          hasHost: Boolean(host),
          hasPort: Boolean(port),
          error,
        });
        this.socket = undefined;
        throw error;
      }
    });
  }

  /**
   * Sends a message to the connected TCP server.
   * @param message The message to send
   * @throws Error if not connected or sending fails
   */
  sendMessage(message: Message) {
    if (!this.socket) throw new Error("TCP not connected");
    try {
      const data = JSON.stringify(message) + "\n";
      this.socket.write(data);
    } catch (error) {
      tcpLog.error("tcp › send failed", { type: message.type, error });
      throw error;
    }
  }

  /**
   * Disconnects the TCP client and cleans up the socket.
   * @throws Error if disconnect fails
   */
  disconnect() {
    try {
      this.socket?.destroy();
      this.socket = undefined;
    } catch (error) {
      tcpLog.error("tcp › disconnect failed", { error });
      throw error;
    }
  }

  /**
   * Returns whether the TCP client is currently connected.
   * @returns boolean True if connected, false otherwise
   */
  get isConnected() {
    try {
      return this.connectionState === "connected";
    } catch (error) {
      tcpLog.error("tcp › connection state read failed", { error });
      return false;
    }
  }
}
