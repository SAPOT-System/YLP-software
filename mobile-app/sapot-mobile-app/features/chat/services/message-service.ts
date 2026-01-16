import { NetworkConfig } from "@/features/shared";
import { TcpServerAdapter } from "../adapter";

export class MessageService {
  constructor(
    private tcpServerAdapter: TcpServerAdapter,
    private networkConfig: NetworkConfig
  ) {
    tcpServerAdapter.on("data", (data) => {
      console.log("[MessageService]: Message recieved:", data);
    });
  }

  start() {
    this.tcpServerAdapter.start(this.networkConfig.port);
  }

  stop() {
    this.tcpServerAdapter.stop();
  }
}
