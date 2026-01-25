import { EventEmitter } from "events";
import Zeroconf from "react-native-zeroconf";

/**
 * ZeroconfAdapter manages network service discovery and publishing using mDNS/ZeroConf.
 * It emits events for service resolution and removal, and provides methods to scan, publish, and clean up services.
 */
export class ZeroconfAdapter extends EventEmitter {
  private zeroconf: Zeroconf;

  /**
   * Constructs a ZeroconfAdapter instance and initializes the underlying Zeroconf object.
   */
  constructor() {
    super();
    this.zeroconf = new Zeroconf();
  }

  /**
   * Starts scanning for network services using Zeroconf.
   * Emits 'serviceResolved' and 'serviceRemoved' events for discovered/removed services.
   * @throws Error if scanning fails
   */
  startScan(): void {
    try {
      if (!this.zeroconf) {
        console.warn("[ZeroconfAdapter]: ZeroConf not initialized");
      }

      this.zeroconf.on("start", () => {});
      console.log("[ZeroconfAdapter]: ZeroConf scan started");

      this.zeroconf.on("stop", () => {
        console.log("[ZeroconfAdapter]: ZeroConf stopped");
      });

      // this.zeroconf.on("update", () => {
      //   console.log("[ZeroconfAdapter]: ZeroConf updated");
      // });

      // this.zeroconf.on("found", (serviceName) => {
      //   console.log("[ZeroconfAdapter]: Service found:", serviceName);
      // });

      this.zeroconf.on("resolved", (service) => {
        // console.log(
        //   "[ZeroconfAdapter]: Service resolved:",
        //   service.name,
        //   service.txt.username
        // );
        // The resolved device/service will inform the service that use this class
        this.emit("serviceResolved", service);
      });

      this.zeroconf.on("remove", (serviceName) => {
        // console.log("[ZeroconfAdapter]: Service removed:", serviceName);
        // The removej device/service will inform the service that use this class
        this.emit("serviceRemoved", serviceName);
      });

      this.zeroconf.scan("lanchat", "tcp", "local.");
      console.log("[ZeroconfAdapter]: Start scanning...");
    } catch (error) {
      console.error("[ZeroconfAdapter]: Error starting discovery:", error);
      throw error;
    }
  }

  /**
   * Stops scanning for network services.
   * @throws Error if stopping scan fails
   */
  stopScan(): void {
    try {
      this.zeroconf.stop();
      console.log("[ZeroconfService]: Stop scanning...");
    } catch (error) {
      console.error("[ZeroconfService]: Error stopping scan:", error);
      throw error;
    }
  }

  /**
   * Publishes a network service using Zeroconf.
   * @param service The service details (type, protocol, domain, name, port, txt)
   * @throws Error if publishing fails
   */
  publishService(service: {
    type: string;
    protocol: string;
    domain: string;
    name: string;
    port: number;
    txt: { id: string; username: string };
  }): void {
    try {
      if (!this.zeroconf) {
        console.warn("[ZeroconfAdapter]: ZeroConf not initialized");
        return;
      }

      this.zeroconf.on("published", (service) => {
        console.log(
          "[ZeroconfAdapter]: Service published successfully:",
          service.name
        );
      });

      this.zeroconf.on("unpublished", (service) => {
        console.log(
          "[ZeroconfAdapter]: Service unpublished successfully:",
          service.name
        );
      });

      this.zeroconf.on("error", (err) => {
        console.error("[ZeroconfAdapter]: Publish error:", err);
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
    } catch (error) {
      console.error(
        `[ZeroconfAdapter]: Error publishing service\n${JSON.stringify(
          service,
          null,
          2
        )}`
      );
      throw error;
    }
  }

  /**
   * Cleans up Zeroconf resources, unpublishes the service, stops scanning, and removes listeners.
   * @param publishedServiceName The name of the published service to unpublish
   * @throws Error if cleanup fails
   */
  cleanUp(publishedServiceName: string): void {
    if (!this.zeroconf) return;

    try {
      console.log(
        "[ZeroconfAdapter]: Unpublishsing service:",
        publishedServiceName
      );

      this.zeroconf.unpublishService(publishedServiceName);
      this.stopScan();
      this.zeroconf.removeDeviceListeners();

      console.log("[ZeroConf]: Zeroconf successfully cleanup");
    } catch (error) {
      console.error("[ZeroConf]: Error closing zeroconf:", error);
      throw error;
    }
  }
}
