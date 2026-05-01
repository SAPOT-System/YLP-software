import { EventEmitter } from "events";
import Zeroconf from "react-native-zeroconf";
import { PublishedService } from "../types";
import { zeroconfLog } from "../utils/logger";

zeroconfLog.debug("[zeroconf-adapter] module loaded");

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
    zeroconfLog.info("zeroconf › adapter constructed");
  }

  /**
   * Starts scanning for network services using Zeroconf.
   * Emits 'serviceResolved' and 'serviceRemoved' events for discovered/removed services.
   * @throws Error if scanning fails
   */
  startScan(): void {
    try {
      if (!this.zeroconf) {
        zeroconfLog.warn("zeroconf › not initialized");
      }

      this.zeroconf.on("start", () => {});
      zeroconfLog.info("zeroconf › scan started");

      this.zeroconf.on("stop", () => {
        zeroconfLog.info("zeroconf › scan stopped");
      });

      this.zeroconf.on("update", () => {
        zeroconfLog.debug("zeroconf › updated");
      });

      // this.zeroconf.on("found", (serviceName) => {
      //   zeroconfLog.debug("zeroconf › service found", { hasService: true });
      // });

      this.zeroconf.on("resolved", (service) => {
        // zeroconfLog.debug("zeroconf › service resolved", { hasService: true });
        // The resolved device/service will inform the service that use this class
        this.emit("serviceResolved", service);
      });

      this.zeroconf.on("remove", (serviceName) => {
        // zeroconfLog.debug("zeroconf › service removed", { hasService: true });
        // The removej device/service will inform the service that use this class
        this.emit("serviceRemoved", serviceName);
      });

      this.zeroconf.scan("lanchat", "tcp", "local.");
      zeroconfLog.info("zeroconf › scanning");
    } catch (error) {
      zeroconfLog.error("zeroconf › scan start failed", { error });
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
      zeroconfLog.info("zeroconf › scan stop requested");
    } catch (error) {
      zeroconfLog.error("zeroconf › scan stop failed", { error });
      throw error;
    }
  }

  /**
   * Publishes a network service using Zeroconf.
   * @param service The service details (type, protocol, domain, name, port, txt)
   * @throws Error if publishing fails
   */
  publishService(service: PublishedService): void {
    try {
      if (!this.zeroconf) {
        zeroconfLog.warn("zeroconf › not initialized");
        return;
      }

      this.zeroconf.on("published", (service) => {
        zeroconfLog.info("zeroconf › service published", {
          hasServiceName: Boolean(service?.name),
        });
      });

      this.zeroconf.on("unpublished", (service) => {
        zeroconfLog.info("zeroconf › service unpublished", {
          hasServiceName: Boolean(service?.name),
        });
      });

      this.zeroconf.on("error", (err) => {
        zeroconfLog.error("zeroconf › publish error", { error: err });
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
      zeroconfLog.error("zeroconf › publish failed", { error });
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
      zeroconfLog.info("zeroconf › unpublish", {
        hasServiceName: Boolean(publishedServiceName),
      });

      this.zeroconf.unpublishService(publishedServiceName);
      this.stopScan();
      this.zeroconf.removeDeviceListeners();

      zeroconfLog.info("zeroconf › cleanup complete");
    } catch (error) {
      zeroconfLog.error("zeroconf › cleanup failed", { error });
      throw error;
    }
  }
}
