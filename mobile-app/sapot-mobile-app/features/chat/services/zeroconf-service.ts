import Zeroconf, { ImplType, Service } from "react-native-zeroconf";
import {
  getDeviceNameSync,
  getUniqueIdSync,
  getVersion,
} from "react-native-device-info";
import { getUserUUID } from "@/features/shared";
import { Peer } from "../types";
class ZeroconfService {
  private zeroconf;
  private peers: Peer[];
  private listeners: (() => void)[];
  private isScanning: boolean;
  private isPublish: boolean;
  private publishServiceName: string;

  constructor() {
    this.zeroconf = new Zeroconf();
    this.peers = [];
    this.listeners = [];
    this.isScanning = false;
    this.isPublish = false;
    this.publishServiceName = "";
    console.log("[ZeroconfService]: ZeroconfService initialized");
  }

  async startDiscovery() {
    try {
      if (!this.zeroconf) {
        console.warn("[ZeroconfService]: ZeroConf not initialized");
      }
      if (this.isScanning) return;

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

      this.zeroconf.on("remove", (serviceName) => {
        console.log("[ZeroconfService]: Service removed:", serviceName);
        this.removeService(serviceName);
      });

      this.startScan();
    } catch (error) {
      console.error("[ZeroconfService]: Error starting discovery:", error);
    }
  }

  async publishService(port: number = 8080) {
    try {
      if (!this.zeroconf) {
        console.warn("[ZeroconfService]: ZeroConf not initialized");
        return;
      }
      if (this.isPublish) {
        console.warn("[ZeroconfService]: Service is current publish");
        return;
      }

      this.publishServiceName = `MyService-${Date.now()}`;

      const service = {
        type: "lanchat",
        protocol: "tcp",
        domain: "local.",
        name: this.publishServiceName,
        port: port,
        txt: {
          id: await getUserUUID(),
          platform: "react-native",
          version: getVersion(),
          username: getDeviceNameSync(),
        },
      };

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

      setTimeout(() => {
        this.zeroconf.publishService(
          service.type,
          service.protocol,
          service.domain,
          service.name,
          service.port,
          service.txt
        );
      }, 500);
      this.isPublish = true;
    } catch (error) {
      console.error("[ZeroconfService]: Error publishing service:", error);
    }
  }

  close() {
    if (!this.zeroconf) return;
    if (!this.isScanning) return;

    try {
      console.log("Unpublish service:", this.publishServiceName);
      this.zeroconf.unpublishService(this.publishServiceName);
      this.stopScan();
      this.zeroconf.removeDeviceListeners();

      this.isPublish = false;
      console.log("[ZeroconfService]: Zeroconf successfully cleanup");
    } catch (error) {
      console.error("[ZeroconfService]: Error closing zeroconf:", error);
    }
  }

  stopScan() {
    if (!this.isScanning) return;
    console.log("[ZeroconfService]: Stop scanning...");
    this.isScanning = false;
    this.zeroconf.stop();
  }

  startScan() {
    if (this.isScanning) return;
    this.isScanning = true;
    console.log("[ZeroconfService]: Start scanning...");
    this.zeroconf.scan("lanchat", "tcp", "local.");
  }

  subscribe(listener: () => void) {
    this.listeners = [...this.listeners, listener];
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getSnapshot() {
    return this.peers;
  }

  async updateServices(newService: Service) {
    // Exclude the user published service
    if (newService.txt.id === (await getUserUUID())) return;

    const formattedService: Peer = {
      id: newService.txt.id,
      username: newService.txt.username,
      port: newService.port,
      ipAddress: newService.addresses[0],
      serviceName: newService.name,
    };

    const index = this.peers.findIndex((s) => s.id === formattedService.id);

    if (index !== -1) {
      this.peers[index] = formattedService;
    } else {
      this.peers = [...this.peers, formattedService];
    }

    for (const listener of this.listeners) {
      listener();
    }
  }

  async removeService(serviceName: string) {
    console.log("[ZeroconfService]: Before removing peer:", this.peers);

    const updatedServices = this.peers.filter(
      (peer) => peer.serviceName !== serviceName
    );
    console.log("[ZeroconfService]: Updated peers:", updatedServices);

    this.peers = updatedServices;

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
