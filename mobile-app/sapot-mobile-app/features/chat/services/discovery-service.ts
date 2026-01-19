import { Service } from "react-native-zeroconf";
import { ZeroconfAdapter } from "../adapter";
import { SessionStore } from "@/features/shared/stores/session-store";
import { NetworkConfig } from "@/features/shared/stores/network-config";
import { UserStore } from "@/features/shared/stores/user-store";
import { PeerService } from "./peer-service";

// This class will discover devices and make the device discovered by others.
export class DiscoveryService {
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
      console.log("service resolved");
      await this.peerService.register(peerService);
    });

    // Perform logic to make the peer offline when the device/service is removed
    this.adapter.on("serviceRemoved", async (peerServiceName: string) => {
      console.log("service removed");
      await this.peerService.markOffline(peerServiceName);
    });
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
