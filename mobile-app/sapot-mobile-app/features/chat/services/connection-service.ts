import { NetworkConfig } from "@/features/shared";
import { TcpClientAdapter, TcpServerAdapter, WebrtcAdapter } from "../adapter";
import { MessageI, SentMessageI } from "../types";
import { ChatService } from "./chat-service";

// TODO: handle edge cases when the data format is wrong
// This will include the types for both tcp and webrtc message

// This class will handle connection to peers. This will be the one who will send and receive data from peers.
export class ConnectionService {
  private chatService?: ChatService;
  constructor(
    private tcpClientAdapter: TcpClientAdapter,
    private tcpServerAdapter: TcpServerAdapter,
    private webrtcAdapter: WebrtcAdapter,
    private networkConfig: NetworkConfig
  ) {
    webrtcAdapter.on("onicecandidate", (data) => {
      this.sendMessage(data);
    });

    // TODO: listen to the acknowledge of the receiver. In chat service where the undelivered message stored, delete the specific message once sender receive acknowledgement
    webrtcAdapter.on("receivedMessage", (message: MessageI<SentMessageI>) => {
      if (!this.chatService) {
        throw new Error("Chat service not initialize");
      }

      if (message.type === "chat" && message.data) {
        this.sendAckMessage(message.data);
        this.chatService.handleIncomingChatMessage(message.data);
      }
      if (message.type === "ack" && message.data) {
        console.log("Ack received");
        this.chatService.handleAckMessage(message.data.messageId);
      }
    });

    tcpServerAdapter.on("data", (message) => {
      // console.log("[MessageService]: Message recieved:", message);
      if (
        (message.type && message.type === "ice-candidate") ||
        message.type === "offer" ||
        message.type === "answer" ||
        message.type === "handshake"
      ) {
        this.handleWebrtcConnection(message);
      }
      // TODO: soon, implement tcp for fallback of webrtc
    });
  }

  setChatService(chatService: ChatService) {
    this.chatService = chatService;
  }

  start() {
    // await this.webrtcAdapter.initializeLocalStream();
    this.tcpServerAdapter.start(this.networkConfig.port);
    this.webrtcAdapter.createPeerConnection();
  }

  async connectToPeer(ipAddress: string, port: number) {
    await this.tcpClientAdapter.connect(ipAddress, port);

    // Persuade peer to connect to the current user's tcp server by giving the ip address and port
    this.sendMessage({
      type: "handshake",
      data: {
        port: this.networkConfig.port,
        ipAddress: this.networkConfig.ipAddress,
      },
    });

    const offer = await this.webrtcAdapter.createOffer();
    // console.log("[ConnectionService]: Offer:", offer);
    this.sendMessage(offer);
  }

  private async handleWebrtcConnection(message: any) {
    switch (message.type) {
      case "ice-candidate":
        console.log("[ConnectionService]: Handling ice candidate message...");
        // console.log(message);
        await this.webrtcAdapter.addIceCandidate(message.candidate);
        break;
      case "offer":
        console.log("[ConnectionService]: Handling offer message...");
        // console.log(message);
        const answerResponse = await this.webrtcAdapter.handleOffer({
          type: "offer",
          sdp: message.sdp,
        });
        this.sendMessage(answerResponse);
        break;
      case "answer":
        console.log("[ConnectionService]: Handling answer message...");
        // console.log(message);
        await this.webrtcAdapter.handleAnswer({
          type: "answer",
          sdp: message.sdp,
        });
        break;
      case "handshake":
        console.log("[ConnectionService]: Handling handshake message...");
        console.log(message);
        await this.tcpClientAdapter.connect(
          message.data.ipAddress,
          message.data.port
        );
        break;
      default:
        console.log("default");
        break;
    }
  }

  sendMessage(message: any) {
    this.tcpClientAdapter.sendMessage(message);
  }

  // TODO: Make tcp as fallback once webrtc failed
  sendChatMessage({
    message,
    conversationId,
    messageId,
    senderId,
    sentAt,
    messageType,
  }: SentMessageI) {
    try {
      this.webrtcAdapter.sendDataMessage({
        type: "chat",
        data: {
          message: message,
          conversationId: conversationId,
          messageId: messageId,
          senderId: senderId,
          sentAt: sentAt,
          messageType: messageType,
        },
      });
    } catch (error) {
      throw error;
    }
  }

  // TODO: make tcp as fallback
  // ACK message will be used for the sender to know if the message is delivered or not
  sendAckMessage({ messageId }: { messageId: string }) {
    console.log("sending ack message");
    this.webrtcAdapter.sendDataMessage({
      type: "ack",
      data: {
        messageId: messageId,
      },
    });
  }

  disconnect() {
    this.tcpClientAdapter.disconnect();
  }

  stop() {
    this.webrtcAdapter.cleanup();
    this.tcpServerAdapter.stop();
  }

  get isConnected() {
    return this.tcpClientAdapter.isConnected;
  }
}
