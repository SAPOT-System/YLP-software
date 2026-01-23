import { Service } from "react-native-zeroconf";
import { NetworkConfig, SessionStore, UserStore } from "../stores";
import { ZeroconfAdapter } from "../adapters";
import { PeerService } from "./peer-service";
import { ChatService } from "@/features/chat";

// This class will discover devices and make the device discovered by others.
export class DiscoveryService {
  private chatService?: ChatService;
  private publishDeviceName: string = "";
  private intervalId: number = 0;

  constructor(
    private adapter: ZeroconfAdapter,
    private sessionStore: SessionStore,
    private networkConfig: NetworkConfig,
    private userStore: UserStore,
    private peerService: PeerService
  ) {
    // Perform logic on the resolve device/service whether to include in the database or not
    this.adapter.on("serviceResolved", async (peerService: Service) => {
      if (!this.chatService) throw new Error("Chat service not initialized");
      console.log("service resolved");
      await this.peerService.register(peerService);

      // TODO: make the bottom ignore if not necessary to run
      await this.performResendMessagesForPeer(
        peerService.txt.id,
        peerService.addresses[0],
        peerService.port
      );
    });

    // Perform logic to make the peer offline when the device/service is removed
    this.adapter.on("serviceRemoved", async (peerServiceName: string) => {
      console.log("service removed");
      await this.peerService.markOffline(peerServiceName);
    });
  }

  async performResendMessagesForPeer(
    peerId: string,
    ipAddress: string,
    port: number
  ) {
    if (!this.chatService) throw new Error("Chat service not initialized");

    const unsentMessages = await this.chatService.getAllNotSentMessageForPeer(
      peerId
    );

    for (const msg of unsentMessages) {
      try {
        await this.chatService.tryResendMessage(msg, peerId, {
          ipAddress: ipAddress,
          port: port,
        });
      } catch (error) {
        console.warn("Failed to resend the message:", msg);
        console.warn("Error:", error);
      }
    }
  }

  setChatService(chatService: ChatService) {
    this.chatService = chatService;
  }

  startDiscovery() {
    this.adapter.startScan();
  }

  stopDiscovery() {
    this.adapter.stopScan();
  }

  publishDevice() {
    // The service/device name must be unique to avoid conflict/error
    this.publishDeviceName = `Device-${Date.now()}`;

    this.adapter.publishService({
      type: "lanchat",
      protocol: "tcp",
      domain: "local.",
      name: this.publishDeviceName,
      port: this.networkConfig.port,
      txt: {
        id: this.sessionStore.userId,
        username: this.userStore.user.username,
      },
    });
  }

  destroy() {
    this.adapter.cleanUp(this.publishDeviceName);
    if (this.intervalId) clearInterval(this.intervalId);
    this.peerService.cleanUp();
  }
}
