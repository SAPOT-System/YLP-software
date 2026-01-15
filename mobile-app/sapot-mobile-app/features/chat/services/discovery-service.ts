import { Service } from "react-native-zeroconf";
import { ZeroconfAdapter } from "../adapter/zeroconf-adapter";
import { PeerDatabaseService } from "@/features/shared/services/peer-database-service";
import { SessionStore } from "@/features/shared/stores/session-store";
import { NetworkConfig } from "@/features/shared/stores/network-config";
import { UserService } from "@/features/shared/services/user-service";
import { UserStore } from "@/features/shared/stores/user-store";

export class DiscoveryService {
  private adapter: ZeroconfAdapter;
  private publishDeviceName: string = "";
  private db: PeerDatabaseService;
  private intervalId: number = 0;
  private services: Service[] = [];
  private session: SessionStore;
  private networkConfig: NetworkConfig;
  private user: UserStore;

  constructor(
    adapter: ZeroconfAdapter,
    database: PeerDatabaseService,
    session: SessionStore,
    networkConfig: NetworkConfig,
    user: UserStore
  ) {
    this.adapter = adapter;
    this.db = database;
    this.session = session;
    this.networkConfig = networkConfig;
    this.user = user;

    // Perform logic on the resolve device/service whether to include in the database or not
    this.adapter.on("serviceResolved", (service: Service) => {
      console.log("[DiscoveryService]: Resolved Service", service.name);
      this.db.markOnline({
        id: service.txt.id,
        username: service.txt.username,
        port: service.port,
        ipAddress: service.addresses[0],
      });
      this.services.push(service);
    });

    // Perform logic to make the peer offline when the device/service is removed
    this.adapter.on("serviceRemoved", (serviceName: string) => {
      console.log("[DiscoveryService]: Remove Service", serviceName);
      console.log(`[DiscoveryService]: Services: ${this.services}`);
      const removedService = this.services.find(
        (service) => service.name === serviceName
      );

      console.log("[DiscoveryService]: Removed Service:", removedService);
      if (!removedService) return;

      this.services = this.services.filter(
        (service) => service.name !== serviceName
      );

      this.db.markOffline(removedService?.txt.id);
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
        id: this.session.userId,
        username: this.user.username,
      },
    });
  }

  destroy() {
    this.adapter.cleanUp(this.publishDeviceName);
    if (this.intervalId) clearInterval(this.intervalId);
    this.services = [];
  }
}
