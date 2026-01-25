import { ChatService } from "@/features/chat/services/chat-service";
import { DataChatMessageI } from "@/features/chat/types";
import { EventEmitter } from "events";
import { TcpClientAdapter, TcpServerAdapter, WebrtcAdapter } from "../adapters";
import { NetworkConfig, UserStore } from "../stores";
import {
  DataAckMessage,
  SignalingMessage,
  TcpDataMessage,
  WebrtcDataMessage,
} from "../types";

// TODO: make a custom typed event emitter
/**
 * ConnectionService handles peer-to-peer connections, message routing, and event management
 * for both TCP and WebRTC communication in the app.
 *
 * @remarks
 * - Handles signaling and data messages
 * - Emits events for call and stream management
 * - Ensures resource cleanup and robust error handling
 */
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
    tcpServerAdapter.on("data", async (message: TcpDataMessage) => {
      try {
        // Type narrowing for signaling messages
        if (
          message.type === "ice-candidate" ||
          message.type === "offer" ||
          message.type === "answer" ||
          message.type === "handshake"
        ) {
          await this.handleWebrtcConnection(message);
        }
        // TODO: soon, implement tcp for fallback of webrtc

        if (message.type === "audio-call" && "senderId" in message.data) {
          await this.initializeStream(message.data.senderId);
          this.emit("audio-call", message.data.senderId);
        }

        if (message.type === "call-ended" && "senderId" in message.data) {
          // TODO: check if needed to reinitialize local stream
          // TODO: validate that the caller id is the sender
          console.log("call ended");
          this.emit("call-ended");
        }
      } catch (error) {
        console.error("[ConnectionService]: Error in TCP data handler", error);
      }
    });
  }

  /**
   * Sets up WebRTC adapter event listeners for signaling and data channel events.
   * @param webrtcAdapter - The WebrtcAdapter instance
   * @param peerId - The peer's unique identifier
   */
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

    webrtcAdapter.on("receivedMessage", async (message: WebrtcDataMessage) => {
      try {
        if (!this.chatService) {
          throw new Error(
            "Chat service not initialized. Please call setChatService before using chat features."
          );
        }
        // Type narrowing for WebrtcDataMessage
        switch (message.type) {
          case "chat":
            if (message.data) {
              await this.chatService.handleIncomingChatMessage(message.data);
            }
            break;
          case "ack":
            if (message.data) {
              console.log("Ack received");
              await this.chatService.handleAckMessage(message.data.messageId);
            }
            break;
        }
      } catch (error) {
        console.error(
          "[ConnectionService]: Error in WebRTC receivedMessage handler",
          error
        );
      }
    });

    webrtcAdapter.on("remoteStream", (stream) => {
      this.emit("remoteStream", stream);
    });
  }

  /**
   * Retrieves or creates a TcpClientAdapter for the given peer.
   * @param peerId - Unique identifier of the peer
   * @returns TcpClientAdapter instance
   */
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
      console.error(
        `[ConnectionService]: Error getting tcp client adapter\n${JSON.stringify(
          { peerId },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Retrieves or creates a WebrtcAdapter for the given peer and sets up event listeners.
   * @param peerId - Unique identifier of the peer
   * @returns WebrtcAdapter instance
   */
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
      console.error(
        `[ConnectionService]: Error getting webrtc adapter\n${JSON.stringify(
          { peerId },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Sets the chat service instance for handling chat-related events.
   * @param chatService - Instance of ChatService
   */
  setChatService(chatService: ChatService) {
    this.chatService = chatService;
  }

  /**
   * Starts the TCP server and initializes connections.
   * Throws error if startup fails.
   */
  start() {
    try {
      // await this.webrtcAdapter.initializeLocalStream();
      this.tcpServerAdapter.start(this.networkConfig.port);
    } catch (error) {
      console.error("[ConnectionService]: Error starting connection:", error);
      throw error;
    }
  }

  /**
   * Initiates connection to a peer using TCP and WebRTC.
   * Handles timeouts and connection events.
   * @param peerId - Unique identifier of the peer
   * @param ipAddress - IP address of the peer
   * @param port - Port number for TCP connection
   * @returns Promise that resolves when connection is established
   */
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
        console.error(
          `[ConnectionService]: Error connecting to peer\n${JSON.stringify(
            { peerId, ipAddress, port },
            null,
            2
          )}\n${error}`
        );
        reject(error);
      }
    });
  }

  // This method will assume that tcp and webrtc connection is good
  /**
   * Renegotiates the WebRTC connection with the specified peer.
   * @param peerId - Unique identifier of the peer
   */
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
      console.error(
        `[ConnectionService]: Error renegotiating\n${JSON.stringify(
          { peerId },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  // This message is received from tcp client
  /**
   * Handles incoming WebRTC signaling messages received via TCP.
   * Processes ICE candidates, offers, answers, and handshake messages to coordinate
   * the WebRTC connection setup and negotiation between peers.
   * @param message - The signaling message containing type and data for connection negotiation
   */
  private async handleWebrtcConnection(message: SignalingMessage) {
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
      console.error(
        `[ConnectionService]: Error handling webrtc connection\n${JSON.stringify(
          message,
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  // TODO: Probably this method can insert the id of the sender/current user
  /**
   * Sends a TCP data message to the specified peer.
   * @param peerId - Unique identifier of the peer
   * @param message - TcpDataMessage to send
   */
  sendMessage(peerId: string, message: TcpDataMessage) {
    try {
      const adapter = this.getTcpClientAdapter(peerId);
      if (adapter.isConnected) {
        adapter.sendMessage(message);
      }
    } catch (error) {
      console.error(
        `[ConnectionService]: Error sending message\n${JSON.stringify(
          { peerId, ...message },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  // TODO: Make tcp as fallback once webrtc failed
  /**
   * Sends a chat message to the specified peer via WebRTC.
   * @param peerId - Unique identifier of the peer
   * @param messageData - DataChatMessageI containing chat message details
   */
  sendChatMessage(peerId: string, messageData: DataChatMessageI) {
    const {
      message,
      conversationId,
      messageId,
      senderId,
      sentAt,
      messageType,
    } = messageData;
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
      console.error(
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
        )}\n${error}`
      );
      throw error;
    }
  }

  // TODO: make tcp as fallback
  // ACK message will be used for the sender to know if the message is delivered or not
  /**
   * Sends an acknowledgement message to the specified peer.
   * @param peerId - Unique identifier of the peer
   * @param ackData - DataAckMessage containing messageId to acknowledge
   */
  sendAckMessage(peerId: string, ackData: DataAckMessage) {
    const { messageId } = ackData;
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
      console.error(
        `[ConnectionService]: Error sending acknowledge message\n${JSON.stringify(
          {
            peerId,
            messageId,
          },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Initializes the local media stream for the specified peer.
   * @param peerId - Unique identifier of the peer
   */
  async initializeStream(peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Not connected");
      await webrtcAdapter.initializeLocalStream(true, true);
    } catch (error) {
      console.error(
        `[ConnectionService]: Error initializing the stream\n${JSON.stringify(
          {
            peerId,
          },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Terminates the call connection with the specified peer.
   * @param peerId - Unique identifier of the peer
   */
  terminateCallConnection(peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) return;
      webrtcAdapter.terminateCall();
    } catch (error) {
      console.error(
        `[ConnectionService]: Error terminating call connection\n${JSON.stringify(
          {
            peerId,
          },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Toggles the microphone state for the specified peer's connection.
   * @param peerId - Unique identifier of the peer
   */
  toggleMic(peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      webrtcAdapter.toggleMic();
    } catch (error) {
      console.error(
        `[ConnectionService]: Error toggling mic\n${JSON.stringify(
          {
            peerId,
          },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Toggles the camera state for the specified peer's connection.
   * @param peerId - Unique identifier of the peer
   */
  toggleCamera(peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      webrtcAdapter.toggleCamera();
    } catch (error) {
      console.error(
        `[ConnectionService]: Error toggling camera\n${JSON.stringify(
          {
            peerId,
          },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Retrieves the local media stream for the specified peer.
   * @param peerId - Unique identifier of the peer
   * @returns MediaStream instance
   */
  getLocalStream(peerId: string) {
    try {
      const webrtcAdapter = this.getWebrtcAdapter(peerId);
      if (!webrtcAdapter.isConnected) throw new Error("Webrtc not connected");
      return webrtcAdapter.getLocalStream();
    } catch (error) {
      console.error(
        `[ConnectionService]: Error getting local stream\n${JSON.stringify(
          {
            peerId,
          },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Stops all connections, cleans up resources, and removes event listeners.
   * Should be called when the service is no longer needed.
   */
  stop() {
    try {
      this.webrtcAdapters.forEach((webrtc) => webrtc.cleanup());
      this.tcpClientAdapters.forEach((client) => client.disconnect());
      this.tcpServerAdapter.stop();
      this.removeAllListeners();
      this.webrtcAdapters.forEach((adapter) => adapter.removeAllListeners());
    } catch (error) {
      console.error("[ConnectionService]: Error performing stop:", error);
      throw error;
    }
  }
}
