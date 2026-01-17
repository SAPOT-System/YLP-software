import { NetworkConfig } from "@/features/shared";
import { TcpServerAdapter, WebrtcAdapter } from "../adapter";
import { ConnectionService } from "./connection-service";

export class MessageService {
  constructor(
    private tcpServerAdapter: TcpServerAdapter,
    private networkConfig: NetworkConfig,
    private connectionService: ConnectionService
  ) {
    tcpServerAdapter.on("data", (message) => {
      // console.log("[MessageService]: Message recieved:", message);
      if (
        (message.type && message.type === "ice-candidate") ||
        message.type === "offer" ||
        message.type === "answer" ||
        message.type === "handshake"
      ) {
        this.connectionService.handleWebrtcConnection(message);
      }
    });
  }
  start() {
    this.tcpServerAdapter.start(this.networkConfig.port);
  }

  stop() {
    this.tcpServerAdapter.stop();
  }
}
