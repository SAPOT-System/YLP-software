import Zeroconf from "react-native-zeroconf";

class ZeroconfService {
  private zeroconf;

  constructor() {
    this.zeroconf = new Zeroconf();
    console.log("[ZeroconfService]: ZeroconfService initialized");
  }

  startDiscovery() {
    try {
      if (!this.zeroconf) {
        console.warn("[ZeroconfService]: ZeroConf not initialized");
      }

      this.zeroconf.on("start", () => {
        console.log("[ZeroconfService]: ZeroConf scan started");
      });

      this.zeroconf.on("found", (service) => {
        console.log("[ZeroconfService]: Service found:", service);
      });

      this.zeroconf.on("resolved", (service) => {
        console.log("[ZeroconfService]: Service resolved:", service);
      });

      this.zeroconf.on("remove", (service) => {
        console.log("[ZeroconfService]: Service removed:", service);
      });

      this.zeroconf.scan("lanchat", "tcp", "local.");
    } catch (error) {
      console.error("[ZeroconfService]: Error starting discovery:", error);
    }
  }

  publishService(serviceName: string = "service-name", port: number = 8080) {
    try {
      const service = {
        type: "lanchat",
        protocol: "tcp",
        domain: "local.",
        name: serviceName,
        port: port,
        txt: {
          platform: "react-native",
        },
        implType: "NSD" as const,
      };

      if (!this.zeroconf) {
        console.warn("[ZeroconfService]: ZeroConf not initialized");
      }

      this.zeroconf.on("published", (service) => {
        console.log(
          "[ZeroconfService]: Service published successfully:",
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
      this.zeroconf.stop();
      this.zeroconf.removeDeviceListeners();
      this.zeroconf.unpublishService("service-name");
    } catch (error) {
      console.error("[ZeroconfService]: Error closing zeroconf:", error);
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
