import { ChatService } from "@/features/chat/services/chat-service";
import { discoveryLog } from "@/features/shared/utils/logger";
import { Service } from "react-native-zeroconf";
import { ZeroconfAdapter } from "../adapters";
import { AppModeStore, NetworkConfig, SessionStore, UserStore } from "../stores";
import type { ConnectionService } from "./connection-service";
import { PeerService } from "./peer-service";

discoveryLog.debug("[discovery-service] module loaded");

/**
 * DiscoveryService is responsible for discovering devices on the local network and making this device discoverable to others.
 * It manages peer registration, handles service resolution/removal, and coordinates message resending for peers that come online.
 */
export class DiscoveryService {
  private chatService?: ChatService;
  private publishDeviceName: string = "";
  private intervalId: number = 0;
  private published: boolean = false;
  private publishedListeners = new Set<() => void>();

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
    discoveryLog.info("discovery › service constructed", {
      hasAdapter: Boolean(adapter),
      hasSessionStore: Boolean(sessionStore),
      hasNetworkConfig: Boolean(networkConfig),
      hasUserStore: Boolean(userStore),
      hasPeerService: Boolean(peerService),
      hasAppModeStore: Boolean(appModeStore),
    });
    // Handle device/service resolution: register peer and attempt to resend unsent messages
    this.adapter.on("serviceResolved", async (peerService: Service) => {
      try {
        const peerId = peerService.txt?.id;
        if (!peerId) {
          discoveryLog.warn("discovery › service resolved skipped", {
            reason: "missing peer id",
            serviceName: peerService.name,
          });
          return;
        }

        if (peerId === this.sessionStore.userId) {
          discoveryLog.info("discovery › self resolve skipped", { peerId });
          return;
        }

        if (!this.chatService) throw new Error("Chat service not initialized");
        discoveryLog.info("discovery › service resolved", { peerId });
        await this.peerService.register(peerService);

        // Attempt to resend unsent messages to this peer if necessary
        await this.performResendMessagesForPeer(
          peerId,
          peerService.addresses[0],
          peerService.port
        );
      } catch (error) {
        discoveryLog.error("discovery › service resolve failed", {
          peerId: peerService.txt?.id,
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
  async publishDevice(): Promise<void> {
    try {
      if (!this.isZeroconfAllowed()) {
        discoveryLog.info("discovery › publish skipped", { reason: "mode" });
        return;
      }
      const publishDeviceName = `Device-${Date.now()}`;

      await this.adapter.publishService({
        type: "lanchat",
        protocol: "tcp",
        domain: "local.",
        name: publishDeviceName,
        port: this.networkConfig.port,
        txt: {
          id: this.sessionStore.userId,
          username: this.userStore.user.username,
          firstName: this.userStore.user.firstName,
          lastName: this.userStore.user.lastName || "",
        },
      });

      this.publishDeviceName = publishDeviceName;
      discoveryLog.info("discovery › device published", {
        serviceName: this.publishDeviceName,
      });
      this.setPublished(true);
    } catch (error) {
      discoveryLog.error("discovery › publish failed", { error });
      this.setPublished(false);
      throw error;
    }
  }

  /**
   * Cleans up resources, stops discovery, and resets peer state. Should be called when the service is no longer needed.
   */
  destroy() {
    try {
      if (this.publishDeviceName) {
        this.adapter.cleanUp(this.publishDeviceName);
      }
      if (this.intervalId) clearInterval(this.intervalId);
      this.peerService.cleanUp();
      this.setPublished(false);
    } catch (error) {
      discoveryLog.error("discovery › destroy failed", { error });
      throw error;
    }
  }

  isPublished(): boolean {
    return this.published;
  }

  subscribeToPublished(listener: () => void): () => void {
    this.publishedListeners.add(listener);
    return () => this.publishedListeners.delete(listener);
  }

  private setPublished(value: boolean): void {
    if (this.published === value) return;
    this.published = value;
    discoveryLog.debug("discovery › published state changed", { published: value });
    this.publishedListeners.forEach((listener) => listener());
  }

  private isZeroconfAllowed(): boolean {
    return this.appModeStore.isZeroconfAllowed(this.userStore.isGuest);
  }
}
