import { discoveryLog } from "@/features/shared/core/utils/logger";
import { IDiscoveryChatService } from "./service-interfaces";
import { Service } from "react-native-zeroconf";
import { ZeroconfAdapter } from "../adapters";
import { AppModeStore, NetworkConfig, SessionStore, UserStore } from "../../core/stores";
import type { ConnectionService } from "./connection-service";
import { PeerService } from "../../peer/peer-service";

discoveryLog.debug("[discovery-service] module loaded");

/**
 * DiscoveryService is responsible for discovering devices on the local network and making this device discoverable to others.
 * It manages peer registration, handles service resolution/removal, and coordinates message resending for peers that come online.
 */
/** A discovered peer is considered stale once it hasn't been re-resolved within this window. */
const STALE_TTL_MS = 60_000;
/** How often the liveness sweep runs to probe stale peers. */
const LIVENESS_SWEEP_INTERVAL_MS = 30_000;
/** Consecutive failed probes before a peer is evicted as offline. */
const MAX_MISSED_PROBES = 2;
/** Bare TCP connect timeout used by the liveness probe. */
const PROBE_TIMEOUT_MS = 3_000;
/** How often to force a fresh mDNS browse to recover from packet loss. */
const RESCAN_INTERVAL_MS = 150_000;
/** Minimum spacing between unsent-message resend attempts for the same peer. */
const RESEND_DEBOUNCE_MS = 10_000;

export class DiscoveryService {
  private chatService?: IDiscoveryChatService;
  private connectionService?: ConnectionService;
  private publishDeviceName: string = "";
  private publishDevicePromise?: Promise<void>;
  private intervalId: number = 0;
  private sweepIntervalId?: ReturnType<typeof setInterval>;
  private rescanIntervalId?: ReturnType<typeof setInterval>;
  private lastResendAt = new Map<string, number>();
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
        const { addressChanged } = await this.peerService.register(
          peerService,
          this.networkConfig.ipAddress
        );

        // The peer re-advertised at a new address (e.g. restarted its TCP server
        // on a different port). Evict the stale TCP adapter and notify so an open
        // chat can re-dial the new address instead of the dead one.
        if (addressChanged) {
          this.connectionService?.handlePeerRediscovered(peerId);
        }

        // Resend unsent messages, but debounce per peer so a flapping or
        // rapidly-rebroadcasting peer on a busy LAN doesn't trigger a resend storm.
        const now = Date.now();
        const lastResend = this.lastResendAt.get(peerId) ?? 0;
        if (now - lastResend >= RESEND_DEBOUNCE_MS) {
          this.lastResendAt.set(peerId, now);
          await this.performResendMessagesForPeer(
            peerId,
            this.peerService.findDiscoveredPeerById(peerId)?.ipAddress ??
              peerService.addresses?.[0],
            peerService.port
          );
        } else {
          discoveryLog.debug("discovery › resend debounced", { peerId });
        }
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
  setChatService(chatService: IDiscoveryChatService) {
    this.chatService = chatService;
  }

  /**
   * Subscribes to ConnectionService's "peer-reconnected" event to drain the
   * outbound queue whenever a WebRTC data channel reopens for a peer.
   * Call this once after both services are constructed (e.g. in MainContainer).
   */
  setConnectionService(connectionService: ConnectionService): void {
    this.connectionService = connectionService;
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
      this.startLivenessSweep();
      this.startPeriodicRescan();
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
      this.stopLivenessSweep();
      this.stopPeriodicRescan();
      this.adapter.stopScan();
    } catch (error) {
      discoveryLog.error("discovery › stop failed", { error });
      throw error;
    }
  }

  private startLivenessSweep(): void {
    if (this.sweepIntervalId) return;
    this.sweepIntervalId = setInterval(() => {
      void this.sweepLiveness();
    }, LIVENESS_SWEEP_INTERVAL_MS);
  }

  private stopLivenessSweep(): void {
    if (!this.sweepIntervalId) return;
    clearInterval(this.sweepIntervalId);
    this.sweepIntervalId = undefined;
  }

  private startPeriodicRescan(): void {
    if (this.rescanIntervalId) return;
    this.rescanIntervalId = setInterval(() => {
      try {
        this.adapter.restartScan();
      } catch (error) {
        discoveryLog.warn("discovery › periodic rescan failed", { error });
      }
    }, RESCAN_INTERVAL_MS);
  }

  private stopPeriodicRescan(): void {
    if (!this.rescanIntervalId) return;
    clearInterval(this.rescanIntervalId);
    this.rescanIntervalId = undefined;
  }

  /**
   * Probes discovered peers that haven't been re-resolved recently and evicts
   * those that fail repeatedly. This is the fallback for peers that drop off the
   * LAN without emitting an mDNS "goodbye" (e.g. airplane mode, dead battery),
   * which would otherwise linger as "online" forever.
   */
  async sweepLiveness(): Promise<void> {
    const connectionService = this.connectionService;
    if (!connectionService) return;

    const now = Date.now();
    // Snapshot — markOffline mutates the underlying list.
    const peers = [...this.peerService.getDiscoveredPeers()];

    for (const peer of peers) {
      if (now - peer.lastSeenAt < STALE_TTL_MS) continue;
      if (!peer.ipAddress || !peer.port) continue;

      try {
        const reachable = await connectionService.probePeerReachable(
          peer.ipAddress,
          peer.port,
          PROBE_TIMEOUT_MS
        );

        if (reachable) {
          this.peerService.resetProbeFailures(peer.id);
          this.peerService.touchDiscoveredPeer(peer.id);
          continue;
        }

        const misses = this.peerService.recordProbeFailure(peer.id);
        discoveryLog.info("discovery › liveness probe failed", {
          peerId: peer.id,
          misses,
        });

        if (misses >= MAX_MISSED_PROBES) {
          discoveryLog.warn("discovery › evicting stale peer", {
            peerId: peer.id,
          });
          await this.peerService.markOffline(peer.serviceName);
          connectionService.handlePeerRediscovered(peer.id);
        }
      } catch (error) {
        discoveryLog.warn("discovery › liveness probe errored", {
          peerId: peer.id,
          error,
        });
      }
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

      if (this.published) {
        discoveryLog.debug("discovery › publish skipped", {
          reason: "already published",
          serviceName: this.publishDeviceName,
        });
        return;
      }

      if (this.publishDevicePromise) {
        return this.publishDevicePromise;
      }

      const publishDeviceName = `Device-${Date.now()}`;

      this.publishDeviceName = publishDeviceName;
      this.publishDevicePromise = (async () => {
        try {
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

          discoveryLog.info("discovery › device published", {
            serviceName: this.publishDeviceName,
          });
          this.setPublished(true);
        } catch (error) {
          if (this.publishDeviceName === publishDeviceName) {
            this.publishDeviceName = "";
          }

          throw error;
        }
      })();

      await this.publishDevicePromise;
    } catch (error) {
      discoveryLog.error("discovery › publish failed", { error });
      this.setPublished(false);
      throw error;
    } finally {
      this.publishDevicePromise = undefined;
    }
  }

  /**
   * Re-advertises this device after a local network change (e.g. the device's
   * Wi-Fi IP changed). The old mDNS record still points at the dead address, so
   * we unpublish it and publish a fresh record carrying the new address, then
   * restart the browse (adapter cleanup severs the scan bridge).
   */
  async republish(): Promise<void> {
    try {
      if (!this.isZeroconfAllowed()) {
        discoveryLog.info("discovery › republish skipped", { reason: "mode" });
        return;
      }

      discoveryLog.info("discovery › republish start");
      const oldName = this.publishDeviceName;

      // Reset publish state so publishDevice() runs again with the new address.
      if (this.publishDevicePromise) {
        try {
          await this.publishDevicePromise;
        } catch {
          // ignore — we're tearing this advertisement down anyway
        }
      }
      this.publishDevicePromise = undefined;
      this.publishDeviceName = "";
      this.setPublished(false);

      if (oldName) {
        try {
          await this.adapter.cleanUp(oldName);
        } catch (error) {
          discoveryLog.warn("discovery › republish unpublish failed", { error });
        }
      }

      await this.publishDevice();
      // adapter.cleanUp() reinitializes the native bridge and stops the scan —
      // restart discovery so we keep resolving peers on the new interface.
      this.startDiscovery();
      discoveryLog.info("discovery › republish complete");
    } catch (error) {
      discoveryLog.error("discovery › republish failed", { error });
      throw error;
    }
  }

  /**
   * Cleans up resources, stops discovery, and resets peer state. Should be called when the service is no longer needed.
   */
  async destroy(): Promise<void> {
    try {
      if (this.publishDevicePromise) {
        try {
          await this.publishDevicePromise;
        } catch {
          // Continue cleanup even if publish failed or timed out.
        }
      }

      if (this.publishDeviceName) {
        await this.adapter.cleanUp(this.publishDeviceName);
      }
      if (this.intervalId) clearInterval(this.intervalId);
      this.stopLivenessSweep();
      this.stopPeriodicRescan();
      this.lastResendAt.clear();
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
