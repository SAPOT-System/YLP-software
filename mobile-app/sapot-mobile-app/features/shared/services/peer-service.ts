import { Service } from "react-native-zeroconf";
import { getUserById } from "../api/search.api";
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
   * Registers a discovered peer service. If the peer exists, marks it online; otherwise, saves it.
   * Also adds the peer to the discoveredPeerServices list if not already present.
   * @param peerService The discovered network service
   * @returns Promise<void>
   */
  async register(peerService: Service) {
    try {
      const peerId = peerService.txt?.id;
      if (!peerId) {
        peerLog.warn("peer › register skipped", {
          reason: "missing id",
          serviceName: peerService.name,
        });
        return;
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

      const isServiceExist = this.discoveredPeerServices.find(
        (peer) => peer.id === peerId
      );
      if (!isServiceExist) {
        this.discoveredPeerServices.push({
          serviceName: peerService.name,
          id: peerId,
          port: peerService.port,
          ipAddress: peerService.addresses[0],
        });
      }
    } catch (error) {
      peerLog.error("peer › register failed", {
        peerId: peerService.txt?.id,
        serviceName: peerService.name,
        error,
      });
      throw error;
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
      peerLog.error("peer › mark online failed", { peerId: id, error });
      throw error;
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

      await this.peerRepository.markPeerOffline(removedService.id);
    } catch (error) {
      peerLog.error("peer › mark offline failed", {
        serviceName,
        error,
      });
      throw error;
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
      peerLog.error("peer › list failed", { error });
      throw error;
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
      peerLog.error("peer › find failed", { peerId: id, error });
      throw error;
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
    }
  ) {
    try {
      await this.peerRepository.updatePeerInfoById(id, peerInfo);
    } catch (error) {
      peerLog.error("peer › update failed", {
        peerId: id,
        hasEmail: peerInfo.email !== undefined,
        hasPhoneNumber: peerInfo.phoneNumber !== undefined,
        hasLastName: peerInfo.lastName !== undefined,
        emailVerified: peerInfo.emailVerified,
        error,
      });
      throw error;
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
      peerLog.error("peer › discover find failed", { peerId: id, error });
      throw error;
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
    emailVerified?: boolean
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
      });
    } catch (error) {
      peerLog.error("peer › create failed", { peerId: id, error });
      throw error;
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
      return await this.peerRepository.savePeer({
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
      });
    } catch (error) {
      peerLog.error("peer › get or create failed", { peerId: id, error });
      throw error;
    }
  }

  /**
   * Cleans up the in-memory discoveredPeerServices list.
   */
  cleanUp() {
    this.discoveredPeerServices = [];
  }
}
