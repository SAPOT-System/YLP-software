import { ChatService } from "@/features/chat/services/chat-service";
import { Service } from "react-native-zeroconf";
import { ZeroconfAdapter } from "../adapters";
import { AppModeStore, NetworkConfig, SessionStore, UserStore } from "../stores";
import type { ConnectionService } from "./connection-service";
import { PeerService } from "./peer-service";

/**
 * DiscoveryService is responsible for discovering devices on the local network and making this device discoverable to others.
 * It manages peer registration, handles service resolution/removal, and coordinates message resending for peers that come online.
 */
export class DiscoveryService {
  private chatService?: ChatService;
  private publishDeviceName: string = "";
  private intervalId: number = 0;

  /**
   * Constructs a DiscoveryService instance and sets up event listeners for service resolution and removal.
   * @param adapter ZeroconfAdapter instance for network discovery
   * @param sessionStore SessionStore for user session data
   * @param networkConfig NetworkConfig for network settings
   * @param userStore UserStore for user information
   * @param peerService PeerService for peer management
   */
  constructor(
    private adapter: ZeroconfAdapter,
    private sessionStore: SessionStore,
    private networkConfig: NetworkConfig,
    private userStore: UserStore,
    private peerService: PeerService,
    private appModeStore: AppModeStore
  ) {
    // Handle device/service resolution: register peer and attempt to resend unsent messages
    this.adapter.on("serviceResolved", async (peerService: Service) => {
      try {
        if (!this.chatService) throw new Error("Chat service not initialized");
        console.log("service resolved");
        await this.peerService.register(peerService);

        // Attempt to resend unsent messages to this peer if necessary
        await this.performResendMessagesForPeer(
          peerService.txt.id,
          peerService.addresses[0],
          peerService.port
        );
      } catch (error) {
        console.error(
          `[DiscoveryService]: Error handling service resolved\n${JSON.stringify(
            peerService,
            null,
            2
          )}\n${error}`
        );
      }
    });

    // Handle device/service removal: mark peer as offline
    this.adapter.on("serviceRemoved", async (peerServiceName: string) => {
      try {
        console.log("service removed");
        await this.peerService.markOffline(peerServiceName);
      } catch (error) {
        console.error(
          `[DiscoveryService]: Error handling service removed\n${JSON.stringify(
            { peerServiceName },
            null,
            2
          )}\n${error}`
        );
      }
    });
  }

  /**
   * Attempts to resend all unsent messages for a given peer when they come online.
   * @param peerId The ID of the peer
   * @param ipAddress The IP address of the peer
   * @param port The port of the peer
   */
  async performResendMessagesForPeer(
    peerId: string,
    ipAddress: string,
    port: number
  ) {
    try {
      if (!this.chatService) throw new Error("Chat service not initialized");

      // Fetch all unsent messages for this peer
      const unsentMessages = await this.chatService.getAllNotSentMessageForPeer(
        peerId
      );

      // Attempt to resend each unsent message
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
    } catch (error) {
      console.error(
        `[DiscoveryService]: Error performing resend message\n${JSON.stringify(
          { peerId, ipAddress, port },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Sets the ChatService instance to be used for message operations.
   * @param chatService The ChatService instance
   */
  setChatService(chatService: ChatService) {
    this.chatService = chatService;
  }

  /**
   * Subscribes to ConnectionService's "peer-reconnected" event to drain the
   * outbound queue whenever a WebRTC data channel reopens for a peer.
   * Call this once after both services are constructed (e.g. in MainContainer).
   */
  setConnectionService(connectionService: ConnectionService): void {
    connectionService.on("peer-reconnected", async (peerId: string) => {
      try {
        const discoveredPeer = this.peerService.findDiscoveredPeerById(peerId);
        if (!discoveredPeer) {
          console.warn(
            `[DiscoveryService]: peer-reconnected for ${peerId} but peer not in discovered cache — skipping retry`
          );
          return;
        }
        await this.performResendMessagesForPeer(
          peerId,
          discoveredPeer.ipAddress,
          discoveredPeer.port
        );
      } catch (error) {
        console.error(
          `[DiscoveryService]: Error handling peer-reconnected for peer ${peerId}:`,
          error
        );
      }
    });
  }

  /**
   * Starts network discovery to find other devices/services on the local network.
   */
  startDiscovery() {
    try {
      if (!this.isZeroconfAllowed()) {
        console.log(
          "[DiscoveryService]: Discovery skipped (mode disabled)"
        );
        return;
      }
      this.adapter.startScan();
    } catch (error) {
      console.error("[ChatService]: Error starting discovery:", error);
      throw error;
    }
  }

  /**
   * Stops network discovery, halting the search for other devices/services.
   */
  stopDiscovery() {
    try {
      this.adapter.stopScan();
    } catch (error) {
      console.error("[DiscoveryService]: Error stopping discovery:", error);
      throw error;
    }
  }

  /**
   * Publishes this device/service on the local network so it can be discovered by others.
   * The service/device name is made unique to avoid conflicts.
   */
  publishDevice() {
    try {
      if (!this.isZeroconfAllowed()) {
        console.log(
          "[DiscoveryService]: Publish skipped (mode disabled)"
        );
        return;
      }
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
    } catch (error) {
      console.error("[DiscoveryService]: Error publishing device:", error);
      throw error;
    }
  }

  /**
   * Cleans up resources, stops discovery, and resets peer state. Should be called when the service is no longer needed.
   */
  destroy() {
    try {
      this.adapter.cleanUp(this.publishDeviceName);
      if (this.intervalId) clearInterval(this.intervalId);
      this.peerService.cleanUp();
    } catch (error) {
      console.error(
        "[DiscoveryService]: Error destroying discovery service:",
        error
      );
      throw error;
    }
  }

  private isZeroconfAllowed(): boolean {
    return this.appModeStore.isZeroconfAllowed(this.userStore.isGuest);
  }
}
