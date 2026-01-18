import { NetworkConfig, PeerDatabaseService } from "@/features/shared";
import { TcpServerAdapter, WebrtcAdapter } from "../adapter";
import { TcpClientAdapter } from "../adapter/tcp-client-adapter";
import { PeerService } from "./peer-service";

// This class will handle connection to peers. This will be the one who will send and receive data from peers.
export class ConnectionService {
  constructor(
    private tcpClientAdapter: TcpClientAdapter,
    private tcpServerAdapter: TcpServerAdapter,
    private peerService: PeerService,
    private webrtcAdapter: WebrtcAdapter,
    private networkConfig: NetworkConfig
  ) {
    webrtcAdapter.on("onicecandidate", (data) => {
      this.sendMessage(data);
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
    });
  }

  start() {
    // await this.webrtcAdapter.initializeLocalStream();
    this.tcpServerAdapter.start(this.networkConfig.port);
    this.webrtcAdapter.createPeerConnection();
  }

  async connectToPeer(id: string) {
    const { ipAddress, port } = await this.peerService.findPeerById(id);
    await this.tcpClientAdapter.connect(ipAddress, port);
    this.sendMessage({
      type: "handshake",
      data: {
        port: this.networkConfig.port,
        ipAddress: "10.0.2.2",
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

  sendChatMessage(message: any) {
    this.webrtcAdapter.sendDataMessage(message);
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
