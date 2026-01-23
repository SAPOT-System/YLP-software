import { NetworkConfig, UserStore } from "../stores";
import { TcpClientAdapter, TcpServerAdapter, WebrtcAdapter } from "../adapters";
import { MessageI } from "../types";
import { SentMessageI } from "@/features/chat/types";
import { ChatService } from "@/features/chat";

// TODO: handle edge cases when the data format is wrong
// This will include the types for both tcp and webrtc message

// This class will handle connection to peers. This will be the one who will send and receive data from peers.
export class ConnectionService {
  private chatService?: ChatService;
  private tcpClientAdapters: Map<string, TcpClientAdapter> = new Map();
  private webrtcAdapters: Map<string, WebrtcAdapter> = new Map();
  constructor(
    private tcpServerAdapter: TcpServerAdapter,
    private networkConfig: NetworkConfig,
    private userStore: UserStore
  ) {
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

  setupWebrtcEvents(webrtcAdapter: WebrtcAdapter, peerId: string) {
    console.log("Setupwebrtc events");
    webrtcAdapter.on("onicecandidate", (candidate) => {
      this.sendMessage(peerId, {
        type: "ice-candidate",
        data: { senderId: this.userStore.user.id, candidate: candidate },
      });
    });

    webrtcAdapter.on("receivedMessage", (message: MessageI<SentMessageI>) => {
      if (!this.chatService) {
        throw new Error("Chat service not initialize");
      }

      if (message.type === "chat" && message.data) {
        this.sendAckMessage(peerId, message.data);
        this.chatService.handleIncomingChatMessage(message.data);
      }
      if (message.type === "ack" && message.data) {
        console.log("Ack received");
        this.chatService.handleAckMessage(message.data.messageId);
      }
    });
  }

  getTcpClientAdapter(peerId: string) {
    let adapter = this.tcpClientAdapters.get(peerId);
    if (!adapter) {
      adapter = new TcpClientAdapter(peerId);
      this.tcpClientAdapters.set(peerId, adapter);
      console.log("[ConnectionService] Created tcp client adapter");
    }
    return adapter;
  }

  getWebrtcAdapter(peerId: string) {
    let adapter = this.webrtcAdapters.get(peerId);
    if (!adapter) {
      adapter = new WebrtcAdapter(peerId);
      this.setupWebrtcEvents(adapter, peerId);
      this.webrtcAdapters.set(peerId, adapter);
      console.log("[ConnectionService] Created webrtc adater");
    }
    return adapter;
  }

  setChatService(chatService: ChatService) {
    this.chatService = chatService;
  }

  start() {
    // await this.webrtcAdapter.initializeLocalStream();
    this.tcpServerAdapter.start(this.networkConfig.port);
  }

  async connectToPeer(peerId: string, ipAddress: string, port: number) {
    return new Promise<void>(async (resolve, reject) => {
      try {
        const tcpAdapter = this.getTcpClientAdapter(peerId);
        const webrtcAdapter = this.getWebrtcAdapter(peerId);

        if (webrtcAdapter.isConnected) resolve();

        if (!tcpAdapter.isConnected) await tcpAdapter.connect(ipAddress, port);

        webrtcAdapter.once("connection-established", () => {
          resolve();
        });

        webrtcAdapter.once("connection-failed", (error) => {
          reject(error);
        });

        const timeout = setTimeout(() => {
          reject(new Error("Connection timeout"));
        }, 5000);

        webrtcAdapter.once("connection-established", () =>
          clearTimeout(timeout)
        );

        const { type, sdp } = await webrtcAdapter.createOffer();

        // Persuade peer to connect to the current user's tcp server by giving the ip address and port
        this.sendMessage(peerId, {
          type: "handshake",
          data: {
            port: this.networkConfig.port,
            ipAddress: this.networkConfig.ipAddress,
            senderId: this.userStore.user.id,
          },
        });

        this.sendMessage(peerId, {
          type: type,
          data: { sdp: sdp, senderId: this.userStore.user.id },
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // This message is received from tcp client
  private async handleWebrtcConnection(message: any) {
    let webrtcAdapter = this.getWebrtcAdapter(message.data.senderId);
    let tcpClientAdapter: TcpClientAdapter;
    switch (message.type) {
      case "ice-candidate":
        if (webrtcAdapter.isConnected) return;

        console.log("[ConnectionService]: Handling ice candidate message...");
        // console.log(message);
        webrtcAdapter.addIceCandidate(message.data.candidate);
        break;
      case "offer":
        console.log("[ConnectionService]: Handling offer message...");
        // console.log(message);
        if (webrtcAdapter.isConnected) return;
        const { type, sdp } = await webrtcAdapter.handleOffer({
          type: "offer",
          sdp: message.data.sdp,
        });
        this.sendMessage(message.data.senderId, {
          type: type,
          data: { sdp: sdp, senderId: this.userStore.user.id },
        });
        break;
      case "answer":
        console.log("[ConnectionService]: Handling answer message...");
        // console.log(message);
        if (webrtcAdapter.isConnected) return;

        await webrtcAdapter.handleAnswer({
          type: "answer",
          sdp: message.data.sdp,
        });
        break;
      case "handshake":
        console.log("[ConnectionService]: Handling handshake message...");
        // console.log(message);
        if (webrtcAdapter.isConnected) return;

        tcpClientAdapter = this.getTcpClientAdapter(message.data.senderId);
        if (webrtcAdapter.isConnected) return;
        if (!tcpClientAdapter.isConnected)
          await tcpClientAdapter.connect(
            message.data.ipAddress,
            message.data.port
          );
        break;
      default:
        console.log("default");
        break;
    }
  }

  sendMessage(peerId: string, message: any) {
    const adapter = this.getTcpClientAdapter(peerId);
    if (adapter.isConnected) {
      adapter.sendMessage(message);
    }
  }

  // TODO: Make tcp as fallback once webrtc failed
  sendChatMessage(
    peerId: string,
    {
      message,
      conversationId,
      messageId,
      senderId,
      sentAt,
      messageType,
    }: SentMessageI
  ) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);

      webrtcAdapter.sendDataMessage({
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
  sendAckMessage(peerId: string, { messageId }: { messageId: string }) {
    console.log("sending ack message");

    const webrtcAdapter = this.getWebrtcAdapter(peerId);
    webrtcAdapter.sendDataMessage({
      type: "ack",
      data: {
        messageId: messageId,
      },
    });
  }

  disconnect() {
    this.tcpClientAdapters.forEach((client) => client.disconnect());
  }

  stop() {
    this.webrtcAdapters.forEach((webrtc) => webrtc.cleanup());
    this.tcpServerAdapter.stop();
  }
}
