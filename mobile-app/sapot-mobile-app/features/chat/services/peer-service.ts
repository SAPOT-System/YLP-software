import { Service } from "react-native-zeroconf";
import { PeerRepository } from "./peer-repository";

export class PeerService {
  private peerServices: Service[] = [];

  constructor(private peerRepository: PeerRepository) {}

  async register(peerService: Service) {
    const peerExist = await this.peerRepository.isPeerExist(peerService.txt.id);

    if (peerExist) {
      await this.markOnline(peerService.txt.id);
    } else {
      await this.peerRepository.addPeer({
        id: peerService.txt.id,
        username: peerService.txt.username,
        port: peerService.port,
        ipAddress: peerService.addresses[0],
      });
    }

    this.peerServices.push(peerService);
  }

  async markOnline(id: string) {
    console.log("Mark online");
    await this.peerRepository.markPeerOnline(id);
  }

  async markOffline(serviceName: string) {
    console.log("Mark offline");
    const removedService = this.peerServices.find(
      (service) => service.name === serviceName
    );

    if (!removedService) return;

    this.peerServices = this.peerServices.filter(
      (service) => service.name !== serviceName
    );

    await this.peerRepository.markPeerOffline(removedService.txt.id);
  }

  async getAllPeers() {
    const peers = await this.peerRepository.queryAllPeers();
    return peers;
  }

  cleanUp() {
    this.peerServices = [];
  }
}
