import { NetworkConfig, UserStore } from "../stores";
import { TcpClientAdapter, TcpServerAdapter, WebrtcAdapter } from "../adapters";
import { MessageI } from "../types";
import { SentMessageI } from "@/features/chat/types";
import { ChatService } from "@/features/chat/services/chat-service";
import { EventEmitter } from "events";

// TODO: handle edge cases when the data format is wrong
// This will include the types for both tcp and webrtc message

/**
 *  This class will handle connection to peers. This will be the one who will send and receive data from peers.
 *  */
export class ConnectionService extends EventEmitter {
  private tcpClientAdapters: Map<string, TcpClientAdapter> = new Map();
  private chatService?: ChatService;
  private webrtcAdapters: Map<string, WebrtcAdapter> = new Map();
  constructor(
    private tcpServerAdapter: TcpServerAdapter,
    private networkConfig: NetworkConfig,
    private userStore: UserStore
  ) {
    super();
    tcpServerAdapter.on("data", async (message) => {
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

      if (
        message.type &&
        message.type === "audio-call" &&
        message.data.senderId
      ) {
        await this.initializeStream(message.data.senderId);
        this.emit("audio-call", message.data.senderId);
      }

      if (
        message.type &&
        message.type === "call-ended" &&
        message.data.senderId
      ) {
        // TODO: check if needed to reinitialize local stream
        // TODO: validate that the caller id is the sender
        console.log("call ended");
        this.emit("call-ended");
      }
    });
  }

  setupWebrtcEvents(webrtcAdapter: WebrtcAdapter, peerId: string) {
    console.log("Setupwebrtc events");
    webrtcAdapter.on("onicecandidate", (candidate) => {
      try {
        this.sendMessage(peerId, {
          type: "ice-candidate",
          data: { senderId: this.userStore.user.id, candidate: candidate },
        });
      } catch (error) {
        console.error(
          "[ConnectionService]: Error sending ice candidate:",
          error
        );
      }
    });

    webrtcAdapter.on(
      "receivedMessage",
      async (message: MessageI<SentMessageI>) => {
        if (!this.chatService) {
          throw new Error("Chat service not initialize");
        }

        if (message.type === "chat" && message.data) {
          try {
            // TODO: remove send ack duplication
            this.chatService.handleIncomingChatMessage(message.data);
            this.sendAckMessage(peerId, { messageId: message.data.messageId });
          } catch (error) {
            `[ConnectionService]: Error handling incoming chat message\n${JSON.stringify(
              message,
              null,
              2
            )}\n${error}`;
          }
        }
        if (message.type === "ack" && message.data) {
          try {
            console.log("Ack received");
            this.chatService.handleAckMessage(message.data.messageId);
          } catch (error) {
            `[ConnectionService]: Error handling acknowledge message\n${JSON.stringify(
              message,
              null,
              2
            )}\n${error}`;
          }
        }
      }
    );

    webrtcAdapter.on("remoteStream", (stream) => {
      this.emit("remoteStream", stream);
    });
  }

  getTcpClientAdapter(peerId: string) {
    try {
      let adapter = this.tcpClientAdapters.get(peerId);
      if (!adapter) {
        adapter = new TcpClientAdapter(peerId);
        this.tcpClientAdapters.set(peerId, adapter);
        console.log("[ConnectionService] Created tcp client adapter");
      }
      return adapter;
    } catch (error) {
      `[ConnectionService]: Error getting tcp client adapter\n${JSON.stringify(
        { peerId },
        null,
        2
      )}\n${error}`;
      throw error;
    }
  }

  getWebrtcAdapter(peerId: string) {
    try {
      let adapter = this.webrtcAdapters.get(peerId);
      if (!adapter) {
        adapter = new WebrtcAdapter(peerId);
        this.setupWebrtcEvents(adapter, peerId);
        this.webrtcAdapters.set(peerId, adapter);
        console.log("[ConnectionService] Created webrtc adater");
      }
      return adapter;
    } catch (error) {
      `[ConnectionService]: Error getting webrtc adapter\n${JSON.stringify(
        { peerId },
        null,
        2
      )}\n${error}`;
      throw error;
    }
  }

  setChatService(chatService: ChatService) {
    this.chatService = chatService;
  }

  start() {
    try {
      // await this.webrtcAdapter.initializeLocalStream();
      this.tcpServerAdapter.start(this.networkConfig.port);
    } catch (error) {
      console.error("[ConnectionService]: Error starting connection:", error);
      throw error;
    }
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
        }, 20000);

        webrtcAdapter.once("connection-established", () => {
          clearTimeout(timeout);
        });

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
        `[ConnectionService]: Error connecting to peer\n${JSON.stringify(
          { peerId, ipAddress, port },
          null,
          2
        )}\n${error}`;
        reject(error);
      }
    });
  }

  // This method will assume that tcp and webrtc connection is good
  async renegotiate(peerId: string) {
    try {
      const tcpAdapter = this.getTcpClientAdapter(peerId);
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!tcpAdapter.isConnected && !webrtcAdapter.isConnected)
        throw new Error("Not connected");

      const { type, sdp } = await webrtcAdapter.createOffer();
      this.sendMessage(peerId, {
        type: type,
        data: { sdp: sdp, senderId: this.userStore.user.id },
      });
    } catch (error) {
      `[ConnectionService]: Error renegotiating\n${JSON.stringify(
        { peerId },
        null,
        2
      )}\n${error}`;
      throw error;
    }
  }

  // This message is received from tcp client
  private async handleWebrtcConnection(message: any) {
    try {
      let webrtcAdapter = this.getWebrtcAdapter(message.data.senderId);
      let tcpClientAdapter: TcpClientAdapter;
      switch (message.type) {
        case "ice-candidate":
          if (webrtcAdapter.isConnected) return;

          console.log("[ConnectionService]: Handling ice candidate message...");
          webrtcAdapter.addIceCandidate(message.data.candidate);
          break;
        case "offer":
          console.log("[ConnectionService]: Handling offer message...");
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
          if (tcpClientAdapter.isConnected) return;

          await tcpClientAdapter.connect(
            message.data.ipAddress,
            message.data.port
          );
          break;
        default:
          console.log("default");
          break;
      }
    } catch (error) {
      `[ConnectionService]: Error handling webrtc connection\n${JSON.stringify(
        message,
        null,
        2
      )}\n${error}`;
      throw error;
    }
  }

  // TODO: Probably this method can insert the id of the sender/current user
  sendMessage(peerId: string, message: any) {
    try {
      const adapter = this.getTcpClientAdapter(peerId);
      if (adapter.isConnected) {
        adapter.sendMessage(message);
      }
    } catch (error) {
      `[ConnectionService]: Error sending message\n${JSON.stringify(
        { peerId, ...message },
        null,
        2
      )}\n${error}`;
      throw error;
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
      `[ConnectionService]: Error sending chat message\n${JSON.stringify(
        {
          peerId,
          message,
          conversationId,
          messageId,
          senderId,
          sentAt,
          messageType,
        },
        null,
        2
      )}\n${error}`;
      throw error;
    }
  }

  // TODO: make tcp as fallback
  // ACK message will be used for the sender to know if the message is delivered or not
  sendAckMessage(peerId: string, { messageId }: { messageId: string }) {
    try {
      console.log("sending ack message");

      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      webrtcAdapter.sendDataMessage({
        type: "ack",
        data: {
          messageId: messageId,
        },
      });
    } catch (error) {
      `[ConnectionService]: Error sending acknowledge message\n${JSON.stringify(
        {
          peerId,
          messageId,
        },
        null,
        2
      )}\n${error}`;
      throw error;
    }
  }

  async initializeStream(peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Not connected");
      await webrtcAdapter.initializeLocalStream(true, true);
    } catch (error) {
      `[ConnectionService]: Error initializing the stream\n${JSON.stringify(
        {
          peerId,
        },
        null,
        2
      )}\n${error}`;
      throw error;
    }
  }

  terminateCallConnection(peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) return;
      webrtcAdapter.terminateCall();
    } catch (error) {
      `[ConnectionService]: Error terminating call connection\n${JSON.stringify(
        {
          peerId,
        },
        null,
        2
      )}\n${error}`;
      throw error;
    }
  }

  toggleMic(peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      webrtcAdapter.toggleMic();
    } catch (error) {
      `[ConnectionService]: Error toggling mic\n${JSON.stringify(
        {
          peerId,
        },
        null,
        2
      )}\n${error}`;
      throw error;
    }
  }

  toggleCamera(peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      webrtcAdapter.toggleCamera();
    } catch (error) {
      `[ConnectionService]: Error toggling camera\n${JSON.stringify(
        {
          peerId,
        },
        null,
        2
      )}\n${error}`;
      throw error;
    }
  }

  getLocalStream(peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      return webrtcAdapter.getLocalStream();
    } catch (error) {
      `[ConnectionService]: Error getting local stream\n${JSON.stringify(
        {
          peerId,
        },
        null,
        2
      )}\n${error}`;
      throw error;
    }
  }

  disconnect() {
    try {
      this.tcpClientAdapters.forEach((client) => client.disconnect());
    } catch (error) {
      console.error(
        "[ConnectionService]: Error performing disconnection:",
        error
      );
      throw error;
    }
  }

  stop() {
    try {
      this.webrtcAdapters.forEach((webrtc) => webrtc.cleanup());
      this.tcpServerAdapter.stop();
    } catch (error) {
      console.error("[ConnectionService]: Error performing stop:", error);
      throw error;
    }
  }
}
