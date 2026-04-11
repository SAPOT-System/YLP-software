import { ChatService } from "@/features/chat/services/chat-service";
import baseLogger from "@/features/shared/utils/logger";
import { Service } from "react-native-zeroconf";
import { ZeroconfAdapter } from "../adapters";
import { AppModeStore, NetworkConfig, SessionStore, UserStore } from "../stores";
import type { ConnectionService } from "./connection-service";
import { PeerService } from "./peer-service";

const discoveryLog = baseLogger.extend("discovery");

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
        discoveryLog.info("discovery › service resolved", {
          peerId: peerService.txt.id,
        });
        await this.peerService.register(peerService);

        // Attempt to resend unsent messages to this peer if necessary
        await this.performResendMessagesForPeer(
          peerService.txt.id,
          peerService.addresses[0],
          peerService.port
        );
      } catch (error) {
        discoveryLog.error("discovery › service resolve failed", {
          peerId: peerService.txt.id,
          error,
        });
      }
    });

    // Handle device/service removal: mark peer as offline
    this.adapter.on("serviceRemoved", async (peerServiceName: string) => {
      try {
        discoveryLog.info("discovery › service removed", {
          serviceName: peerServiceName,
        });
        await this.peerService.markOffline(peerServiceName);
      } catch (error) {
        discoveryLog.error("discovery › service remove failed", {
          serviceName: peerServiceName,
          error,
        });
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
          discoveryLog.warn("discovery › resend failed", {
            peerId,
            error,
          });
        }
      }
    } catch (error) {
      discoveryLog.error("discovery › resend batch failed", {
        peerId,
        hasIpAddress: Boolean(ipAddress),
        hasPort: Boolean(port),
        error,
      });
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
          discoveryLog.warn("discovery › peer not in cache", { peerId });
          return;
        }
        await this.performResendMessagesForPeer(
          peerId,
          discoveredPeer.ipAddress,
          discoveredPeer.port
        );
      } catch (error) {
        discoveryLog.error("discovery › peer reconnect handling failed", {
          peerId,
          error,
        });
      }
    });
  }

  /**
   * Starts network discovery to find other devices/services on the local network.
   */
  startDiscovery() {
    try {
      if (!this.isZeroconfAllowed()) {
        discoveryLog.info("discovery › start skipped", { reason: "mode" });
        return;
      }
      this.adapter.startScan();
    } catch (error) {
      discoveryLog.error("discovery › start failed", { error });
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
      discoveryLog.error("discovery › stop failed", { error });
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
        discoveryLog.info("discovery › publish skipped", { reason: "mode" });
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
          firstName: this.userStore.user.firstName,
          lastName: this.userStore.user.lastName || "",
        },
      });
    } catch (error) {
      discoveryLog.error("discovery › publish failed", { error });
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
      discoveryLog.error("discovery › destroy failed", { error });
      throw error;
    }
  }

  private isZeroconfAllowed(): boolean {
    return this.appModeStore.isZeroconfAllowed(this.userStore.isGuest);
  }
}
