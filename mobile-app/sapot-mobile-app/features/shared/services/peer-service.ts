import { Service } from "react-native-zeroconf";
import { PeerRepository } from "../repositories";
import { DiscoveredService } from "../types";

// This class will have a logic of deciding what would happen to the peers
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
  constructor(private peerRepository: PeerRepository) {}

  async register(peerService: Service) {
    try {
      const peerExist = await this.peerRepository.isPeerExist(
        peerService.txt.id
      );

      if (peerExist) {
        await this.markOnline(peerService.txt.id);
      } else {
        await this.peerRepository.savePeer({
          id: peerService.txt.id,
          username: peerService.txt.username,
        });
      }

      const isServiceExist = this.discoveredPeerServices.find(
        (peer) => peer.id === peerService.txt.id
      );
      if (!isServiceExist) {
        this.discoveredPeerServices.push({
          serviceName: peerService.name,
          id: peerService.txt.id,
          port: peerService.port,
          ipAddress: peerService.addresses[0],
        });
      }
    } catch (error) {
      console.error(
        `[PeerService]: Error regestring peer\n${JSON.stringify(
          peerService,
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  async markOnline(id: string) {
    try {
      await this.peerRepository.markPeerOnline(id);
    } catch (error) {
      console.error(
        `[PeerService]: Error marking peer online\n${JSON.stringify(
          { id },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

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
      console.error(
        `[PeerService]: Error marking peer offline\n${JSON.stringify(
          { serviceName },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  async getAllPeers() {
    try {
      const peers = await this.peerRepository.queryAllPeers();
      return peers;
    } catch (error) {
      console.error("[PeerService]: Error getting all peers:", error);
      throw error;
    }
  }

  async findPeerById(id: string) {
    try {
      const peer = await this.peerRepository.queryPeerById(id);
      return peer;
    } catch (error) {
      `[PeerService]: Error finding peer\n${JSON.stringify(
        { id },
        null,
        2
      )}\n${error}`;
      throw error;
    }
  }

  findDiscoveredPeerById(id: string) {
    try {
      console.log(this.discoveredPeerServices);
      const peer = this.discoveredPeerServices.find((peer) => peer.id === id);
      return peer;
    } catch (error) {
      `[PeerService]: Error finding discovered peer\n${JSON.stringify(
        { id },
        null,
        2
      )}\n${error}`;
      throw error;
    }
  }

  // This will be use by user service to identify the current user
  // I chose this approach to minimize the task of the server soon as server needed to consider the user
  async createUser(id: string, username: string) {
    try {
      return await this.peerRepository.savePeer({ id, username });
    } catch (error) {
      `[PeerService]: Error creating user\n${JSON.stringify(
        { id, username },
        null,
        2
      )}\n${error}`;
      throw error;
    }
  }

  cleanUp() {
    this.discoveredPeerServices = [];
  }
}
