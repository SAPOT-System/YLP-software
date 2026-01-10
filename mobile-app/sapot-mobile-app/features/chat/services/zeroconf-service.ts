import Zeroconf, { ImplType, Service } from "react-native-zeroconf";
import {
  getDeviceNameSync,
  getUniqueIdSync,
  getVersion,
} from "react-native-device-info";
import getUserUUID from "@/features/shared/utils/get-user-uuid";

class ZeroconfService {
  private zeroconf;
  private services: Service[];
  private listeners: (() => void)[];

  constructor() {
    this.zeroconf = new Zeroconf();
    this.services = [];
    this.listeners = [];
    console.log("[ZeroconfService]: ZeroconfService initialized");
  }

  async startDiscovery() {
    try {
      if (!this.zeroconf) {
        console.warn("[ZeroconfService]: ZeroConf not initialized");
      }

      this.zeroconf.on("start", () => {
        console.log("[ZeroconfService]: ZeroConf scan started");
      });

      this.zeroconf.on("stop", () => {
        console.log("[ZeroconfService]: ZeroConf stopped");
      });

      this.zeroconf.on("update", () => {
        console.log("[ZeroconfService]: ZeroConf updated");
      });

      this.zeroconf.on("found", (serviceName) => {
        console.log("[ZeroconfService]: Service found:", serviceName);
      });

      this.zeroconf.on("resolved", (service) => {
        console.log("[ZeroconfService]: Service resolved:", service);
        this.updateServices(service);
      });

      this.zeroconf.on("remove", (service) => {
        console.log("[ZeroconfService]: Service removed:", service);
      });

      this.zeroconf.scan("lanchat", "tcp", "local.", "DNSSD");
    } catch (error) {
      console.error("[ZeroconfService]: Error starting discovery:", error);
    }
  }

  async publishService(port: number = 8080) {
    try {
      const service = {
        type: "lanchat",
        protocol: "tcp",
        domain: "local.",
        name: getDeviceNameSync(),
        port: port,
        txt: {
          id: await getUserUUID(),
          platform: "react-native",
          version: getVersion(),
          username: getDeviceNameSync(),
        },
        implType: "DNSSD" as ImplType,
      };

      console.log(service.txt.id);

      if (!this.zeroconf) {
        console.warn("[ZeroconfService]: ZeroConf not initialized");
      }

      this.zeroconf.on("published", (service) => {
        console.log(
          "[ZeroconfService]: Service published successfully:",
          service
        );
      });

      this.zeroconf.on("unpublished", (service) => {
        console.log(
          "[ZeroconfService]: Service unpublished successfully:",
          service
        );
      });

      this.zeroconf.on("error", (err) => {
        console.error("[ZeroconfService]: Publish error:", err);
      });

      this.zeroconf.publishService(
        service.type,
        service.protocol,
        service.domain,
        service.name,
        service.port,
        service.txt,
        service.implType
      );
    } catch (error) {
      console.error("[ZeroconfService]: Error publishing service:", error);
    }
  }

  close() {
    if (!this.zeroconf) return;
    try {
      this.zeroconf.unpublishService(getDeviceNameSync(), "DNSSD");
      this.zeroconf.stop("DNSSD");
      this.zeroconf.removeDeviceListeners();
      console.log("[ZeroconfService]: Zeroconf successfully unmount");
    } catch (error) {
      console.error("[ZeroconfService]: Error closing zeroconf:", error);
    }
  }

  subscribe(listener: () => void) {
    this.listeners = [...this.listeners, listener];
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getSnapshot() {
    return this.services;
  }

  updateServices(newService: Service) {
    const index = this.services.findIndex(
      (s) => s.txt.id === newService.txt.id
    );

    if (index !== -1) {
      this.services[index] = newService;
    } else {
      this.services = [...this.services, newService];
    }

    for (const listener of this.listeners) {
      listener();
    }
  }

  getServices() {
    try {
      return this.zeroconf.getServices();
    } catch (error) {
      console.error("[ZeroconfService]: Error getting services:", error);
    }
  }
}

const zeroconf = new ZeroconfService();
export default zeroconf;
