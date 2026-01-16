import { TcpMessage } from "../types";
import { ConnectionService } from "./connection-service";

export class ChatService {
  constructor(private connectionService: ConnectionService) {}

  sendChatMessage(message: TcpMessage<any>) {
    if (!this.connectionService.isConnected)
      throw new Error("Not connected to peer");

    this.connectionService.sendMessage(message);
  }
}
