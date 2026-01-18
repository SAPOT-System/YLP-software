import { TcpMessage } from "../types";
import { ConnectionService } from "./connection-service";

// This is class will be responsible of behavior and rules of the conversation/chat.
export class ChatService {
  constructor(private connectionService: ConnectionService) {}

  sendChatMessage(message: TcpMessage<any>) {
    if (!this.connectionService.isConnected)
      throw new Error("Not connected to peer");

    this.connectionService.sendChatMessage(message);
  }
}
