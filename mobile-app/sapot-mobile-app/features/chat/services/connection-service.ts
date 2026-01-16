import { PeerDatabaseService } from "@/features/shared";
import { TcpClientAdapter } from "../adapter/tcp-client-adapter";
import { TcpMessage } from "../types";

export class ConnectionService {
  constructor(
    private tcpClientAdapter: TcpClientAdapter,
    private database: PeerDatabaseService
  ) {}

  async connectToPeer(id: string) {
    const { ipAddress, port } = await this.database.findById(id);
    await this.tcpClientAdapter.connect(ipAddress, port);
  }

  sendMessage(message: TcpMessage<any>) {
    this.tcpClientAdapter.sendMessage(message);
  }

  disconnect() {
    this.tcpClientAdapter.disconnect();
  }

  get isConnected() {
    return this.tcpClientAdapter.isConnected;
  }
}
