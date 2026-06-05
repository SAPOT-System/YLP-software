import { Service } from "react-native-zeroconf";
import { getUserById } from "../api/search.api";
import { toAppError, captureAppError } from "@/features/shared/errors";
import { PeerRepository } from "../repositories";
import { DiscoveredService } from "../types";
import { peerLog } from "../utils/logger";

peerLog.debug("[peer-service] module loaded");

/**
 * PeerService manages peer discovery, registration, online/offline state, and peer repository operations.
 * It maintains a list of discovered peers and coordinates with the repository for persistent peer data.
 */
export class PeerService {
  discoveredPeerServices: DiscoveredService[] = [
    // This commented data is for development phase
    // {
    //   serviceName: "Pixel4a2",
    //   id: "124151251234235",
    //   ipAddress: "10.0.2.2",
    //   port: 8085,
    // },
  ];
  /** Consecutive failed liveness probes per peer id (used by the discovery sweep). */
  private missedProbes = new Map<string, number>();
  /**
   * Constructs a PeerService instance.
   * @param peerRepository Repository for peer data
   */
  constructor(private peerRepository: PeerRepository) {
    peerLog.info("peer › service constructed", {
      hasPeerRepository: Boolean(peerRepository),
    });
  }

  /**
   * Selects the preferred address to dial from a peer's advertised set. Prefers
   * an address on the same /24 subnet as the local device (most likely reachable
   * for a dual-homed peer with both Wi-Fi and Ethernet), falling back to the
   * first advertised address.
   */
  static selectPreferredAddress(addresses: string[], localIp?: string): string {
    if (!addresses || addresses.length === 0) return "";
    if (localIp) {
      const localPrefix = localIp.split(".").slice(0, 3).join(".");
      const sameSubnet = addresses.find(
        (addr) => addr.split(".").slice(0, 3).join(".") === localPrefix
      );
      if (sameSubnet) return sameSubnet;
    }
    return addresses[0];
  }

  /** Returns the in-memory discovered peer list (used by the liveness sweep). */
  getDiscoveredPeers(): DiscoveredService[] {
    return this.discoveredPeerServices;
  }

  /**
   * Records a failed liveness probe for a peer and returns the new consecutive
   * failure count.
   */
  recordProbeFailure(peerId: string): number {
    const next = (this.missedProbes.get(peerId) ?? 0) + 1;
    this.missedProbes.set(peerId, next);
    return next;
  }

  /** Clears the failed-probe counter for a peer (e.g. after a successful probe). */
  resetProbeFailures(peerId: string): void {
    this.missedProbes.delete(peerId);
  }

  /** Refreshes the last-seen timestamp for a discovered peer. */
  touchDiscoveredPeer(peerId: string): void {
    const existing = this.discoveredPeerServices.find((p) => p.id === peerId);
    if (existing) existing.lastSeenAt = Date.now();
  }

  /**
   * Registers a discovered peer service. If the peer exists, marks it online; otherwise, saves it.
   * Also adds the peer to the discoveredPeerServices list if not already present.
   * @param peerService The discovered network service
   * @returns Promise<void>
   */
  async register(
    peerService: Service,
    localIp?: string
  ): Promise<{ addressChanged: boolean }> {
    try {
      const peerId = peerService.txt?.id;
      if (!peerId) {
        peerLog.warn("peer › register skipped", {
          reason: "missing id",
          serviceName: peerService.name,
        });
        return { addressChanged: false };
      }

      await this.peerRepository.createOrUpdatePeer(
        {
          id: peerId,
          username: peerService.txt?.username,
          firstName: peerService.txt?.firstName,
          lastName: peerService.txt?.lastName,
        },
        { markOnline: true }
      );

      const addresses = peerService.addresses ?? [];
      const ipAddress = PeerService.selectPreferredAddress(addresses, localIp);
      const port = peerService.port;
      const existing = this.discoveredPeerServices.find(
        (peer) => peer.id === peerId
      );

      // The peer was provably present this instant — refresh liveness markers.
      this.missedProbes.delete(peerId);

      if (!existing) {
        this.discoveredPeerServices.push({
          serviceName: peerService.name,
          id: peerId,
          port,
          ipAddress,
          addresses,
          lastSeenAt: Date.now(),
        });
        return { addressChanged: false };
      }

      // Always refresh the cached address — a peer may have restarted its TCP
      // server on a new port/IP and re-advertised under the same id. Without this
      // the cache keeps dialing the dead old address forever.
      const addressChanged =
        existing.port !== port || existing.ipAddress !== ipAddress;
      existing.serviceName = peerService.name;
      existing.port = port;
      existing.ipAddress = ipAddress;
      existing.addresses = addresses;
      existing.lastSeenAt = Date.now();

      if (addressChanged) {
        peerLog.info("peer › discovered address changed", {
          peerId,
          port,
          ipAddress,
        });
      }

      return { addressChanged };
    } catch (error) {
      const appErr = toAppError(error, "network");
      peerLog.error("peer › register failed", {
        peerId: peerService.txt?.id,
        serviceName: peerService.name,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Marks a peer as online in the repository.
   * @param id The peer id
   * @returns Promise<void>
   */
  async markOnline(id: string) {
    try {
      await this.peerRepository.markPeerOnline(id);
    } catch (error) {
      const appErr = toAppError(error, "network");
      peerLog.error("peer › mark online failed", { peerId: id, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Marks a peer as offline and removes it from the discoveredPeerServices list.
   * @param serviceName The service name of the peer
   * @returns Promise<void>
   */
  async markOffline(serviceName: string) {
    try {
      const removedService = this.discoveredPeerServices.find(
        (service) => service.serviceName === serviceName
      );

      if (!removedService) return;

      this.discoveredPeerServices = this.discoveredPeerServices.filter(
        (service) => service.serviceName !== serviceName
      );
      this.missedProbes.delete(removedService.id);

      await this.peerRepository.markPeerOffline(removedService.id);
    } catch (error) {
      const appErr = toAppError(error, "network");
      peerLog.error("peer › mark offline failed", {
        serviceName,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Gets all peers from the repository.
   * @returns Promise<any[]> Array of peer objects
   */
  async getAllPeers() {
    try {
      const peers = await this.peerRepository.queryAllPeers();
      return peers;
    } catch (error) {
      const appErr = toAppError(error, "network");
      peerLog.error("peer › list failed", appErr);
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Finds a peer by id from the repository.
   * @param id The peer id
   * @returns Promise<any> The peer object or undefined
   */
  async findPeerById(id: string) {
    try {
      const peer = await this.peerRepository.queryPeerById(id);
      return peer;
    } catch (error) {
      const appErr = toAppError(error, "network");
      peerLog.error("peer › find failed", { peerId: id, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Updates peer profile fields in the repository.
   * @param id The peer id
   * @param peerInfo The fields to update
   * @returns Promise<void>
   */
  async updatePeerInfo(
    id: string,
    peerInfo: {
      firstName?: string;
      username?: string;
      lastName?: string;
      email?: string;
      phoneNumber?: string;
      emailVerified?: boolean;
      phoneNumberVerified?: boolean;
      isGuest?: boolean;
    }
  ) {
    try {
      await this.peerRepository.updatePeerInfoById(id, peerInfo);
    } catch (error) {
      const appErr = toAppError(error, "network");
      peerLog.error("peer › update failed", {
        peerId: id,
        hasEmail: peerInfo.email !== undefined,
        hasPhoneNumber: peerInfo.phoneNumber !== undefined,
        hasLastName: peerInfo.lastName !== undefined,
        emailVerified: peerInfo.emailVerified,
        phoneNumberVerified: peerInfo.phoneNumberVerified,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Finds a discovered peer by id from the in-memory discoveredPeerServices list.
   * @param id The peer id
   * @returns DiscoveredService | undefined
   */
  findDiscoveredPeerById(id: string) {
    try {
      peerLog.debug("peer › discovered list checked", {
        count: this.discoveredPeerServices.length,
      });
      const peer = this.discoveredPeerServices.find((peer) => peer.id === id);
      return peer;
    } catch (error) {
      const appErr = toAppError(error, "network");
      peerLog.error("peer › discover find failed", { peerId: id, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  // This will be use by user service to identify the current user
  // I chose this approach to minimize the task of the server soon as server needed to consider the user
  /**
   * Creates a new user/peer in the repository.
   * @param id The user/peer id
   * @param username The username
   * @returns Promise<any> The created peer object
   */
  async createUser(
    id: string,
    username: string,
    firstName: string,
    lastName?: string,
    email?: string,
    phoneNumber?: string,
    emailVerified?: boolean,
    phoneNumberVerified?: boolean,
    role?: string
  ) {
    try {
      return await this.peerRepository.savePeer({
        id,
        username,
        firstName,
        lastName,
        email,
        phoneNumber,
        emailVerified,
        phoneNumberVerified,
        role,
      });
    } catch (error) {
      const appErr = toAppError(error, "network");
      peerLog.error("peer › create failed", { peerId: id, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  async upsertPeer(peerInfo: {
    id: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    phoneNumberVerified?: boolean;
    role?: string;
  }) {
    try {
      return await this.peerRepository.createOrUpdatePeer(peerInfo);
    } catch (error) {
      const appErr = toAppError(error, "network");
      peerLog.error("peer › upsert failed", { peerId: peerInfo.id, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  async getOrCreatePeerById(
    id: string,
    connectionService: { isWebSocketAllowed(): boolean }
  ) {
    try {
      const existing = await this.peerRepository.queryPeerById(id);
      if (existing) return existing;

      if (!connectionService.isWebSocketAllowed()) {
        peerLog.warn("peer › get or create skipped, ws not allowed", {
          peerId: id,
        });
        return null;
      }

      const user = await getUserById(id);
      const created = await this.peerRepository.savePeer({
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        phoneNumberVerified: user.phone_is_verified,
        role: user.role,
        isGuest: false,
      });
      const lastActiveMs = this.parseLastActive(user.last_active);
      if (lastActiveMs !== null) {
        await this.peerRepository.setPeerLastSeen(user.id, lastActiveMs);
      }
      return created;
    } catch (error) {
      const appErr = toAppError(error, "network");
      peerLog.error("peer › get or create failed", { peerId: id, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Best-effort refresh of a peer's last-seen timestamp from the server
   * (`UserActivity.last_active`). Used by the chat screen when a peer is offline.
   * Errors are swallowed — this is a non-critical UI enrichment.
   * @param peerId The peer id
   */
  async refreshLastSeen(peerId: string): Promise<void> {
    try {
      const user = await getUserById(peerId);
      const lastActiveMs = this.parseLastActive(user.last_active);
      if (lastActiveMs !== null) {
        await this.peerRepository.setPeerLastSeen(peerId, lastActiveMs);
      }
    } catch (error) {
      const appErr = toAppError(error, "network");
      peerLog.warn("peer › refresh last seen failed", { peerId, ...appErr });
    }
  }

  /** Parses an ISO timestamp into epoch ms, returning null when absent/invalid. */
  private parseLastActive(isoString?: string | null): number | null {
    if (!isoString) return null;
    const ms = new Date(isoString).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  /**
   * Cleans up the in-memory discoveredPeerServices list.
   */
  cleanUp() {
    this.discoveredPeerServices = [];
    this.missedProbes.clear();
  }
}
