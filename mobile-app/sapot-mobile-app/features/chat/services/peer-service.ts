import { Service } from "react-native-zeroconf";
import { PeerRepository } from "./peer-repository";

export interface DiscoveredService {
  serviceName: string;
  id: string;
  port: number;
  ipAddress: string;
}
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
    const peerExist = await this.peerRepository.isPeerExist(peerService.txt.id);

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
  }

  async markOnline(id: string) {
    await this.peerRepository.markPeerOnline(id);
  }

  async markOffline(serviceName: string) {
    const removedService = this.discoveredPeerServices.find(
      (service) => service.serviceName === serviceName
    );

    if (!removedService) return;

    this.discoveredPeerServices = this.discoveredPeerServices.filter(
      (service) => service.serviceName !== serviceName
    );

    await this.peerRepository.markPeerOffline(removedService.id);
  }

  async getAllPeers() {
    const peers = await this.peerRepository.queryAllPeers();
    return peers;
  }

  async findPeerById(id: string) {
    const peer = await this.peerRepository.queryPeerById(id);
    return peer;
  }

  findDiscoveredPeerById(id: string) {
    console.log(this.discoveredPeerServices);
    const peer = this.discoveredPeerServices.find((peer) => peer.id === id);
    return peer;
  }

  // This will be use by user service to identify the current user
  // I chose this approach to minimize the task of the server soon as server needed to consider the user
  async createUser(id: string, username: string) {
    return await this.peerRepository.savePeer({ id, username });
  }

  cleanUp() {
    this.discoveredPeerServices = [];
  }
}
