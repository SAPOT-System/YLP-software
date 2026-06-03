import { EventEmitter } from "events";
import Zeroconf, { Service } from "react-native-zeroconf";
import { PublishedService } from "../types";
import { zeroconfLog } from "../utils/logger";

zeroconfLog.debug("[zeroconf-adapter] module loaded");

/**
 * ZeroconfAdapter manages network service discovery and publishing using mDNS/ZeroConf.
 * It emits events for service resolution and removal, and provides methods to scan, publish, and clean up services.
 */
export class ZeroconfAdapter extends EventEmitter {
  private zeroconf: Zeroconf;
  private cleanupPromise?: Promise<void>;
  private publishPromise?: Promise<void>;
  private publishedServiceName?: string;
  private publishActive = false;
  private scanning = false;
  private scanListenersAttached = false;

  /**
   * Constructs a ZeroconfAdapter instance and initializes the underlying Zeroconf object.
   */
  constructor() {
    super();
    this.zeroconf = new Zeroconf();
    zeroconfLog.info("zeroconf › adapter constructed");
  }

  private readonly onScanStart = () => {};

  private readonly onScanStop = () => {
    this.scanning = false;
    zeroconfLog.info("zeroconf › scan stopped");
  };

  private readonly onScanUpdate = () => {
    zeroconfLog.debug("zeroconf › updated");
  };

  private readonly onServiceResolved = (service: Service) => {
    this.emit("serviceResolved", service);
  };

  private readonly onServiceRemoved = (serviceName: string) => {
    zeroconfLog.debug("zeroconf › service removed", {
      hasService: true,
      serviceName,
    });
    this.emit("serviceRemoved", serviceName);
  };

  private attachScanListeners(): void {
    if (this.scanListenersAttached) return;

    this.zeroconf.on("start", this.onScanStart);
    this.zeroconf.on("stop", this.onScanStop);
    this.zeroconf.on("update", this.onScanUpdate);
    this.zeroconf.on("resolved", this.onServiceResolved);
    this.zeroconf.on("remove", this.onServiceRemoved);
    this.scanListenersAttached = true;
  }

  private detachScanListeners(): void {
    if (!this.scanListenersAttached) return;

    this.zeroconf.removeListener("start", this.onScanStart);
    this.zeroconf.removeListener("stop", this.onScanStop);
    this.zeroconf.removeListener("update", this.onScanUpdate);
    this.zeroconf.removeListener("resolved", this.onServiceResolved);
    this.zeroconf.removeListener("remove", this.onServiceRemoved);
    this.scanListenersAttached = false;
  }

  /**
   * Starts scanning for network services using Zeroconf.
   * Emits 'serviceResolved' and 'serviceRemoved' events for discovered/removed services.
   * @throws Error if scanning fails
   */
  startScan(): void {
    try {
      if (this.scanning) {
        zeroconfLog.debug("zeroconf › scan already active");
        return;
      }

      if (!this.zeroconf) {
        zeroconfLog.warn("zeroconf › not initialized");
      }

      this.attachScanListeners();
      this.scanning = true;
      this.zeroconf.scan("lanchat", "tcp", "local.");
      zeroconfLog.info("zeroconf › scan started");
    } catch (error) {
      this.scanning = false;
      this.detachScanListeners();
      zeroconfLog.error("zeroconf › scan start failed", { error });
      throw error;
    }
  }

  /**
   * Forces a fresh browse by stopping the current scan and restarting it,
   * bypassing the `scanning` guard in startScan. Used to recover the resolved
   * peer set after mDNS packet loss (which can leave the set partial/stale).
   * @throws Error if restarting the scan fails
   */
  restartScan(): void {
    try {
      this.scanning = false;
      this.zeroconf.stop();
      this.attachScanListeners();
      this.scanning = true;
      this.zeroconf.scan("lanchat", "tcp", "local.");
      zeroconfLog.info("zeroconf › scan restarted");
    } catch (error) {
      this.scanning = false;
      zeroconfLog.error("zeroconf › scan restart failed", { error });
      throw error;
    }
  }

  /**
   * Stops scanning for network services.
   * @throws Error if stopping scan fails
   */
  stopScan(): void {
    try {
      this.scanning = false;
      this.detachScanListeners();
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
  async publishService(service: PublishedService): Promise<void> {
    if (this.publishPromise) {
      return this.publishPromise;
    }

    this.publishPromise = (async () => {
      try {
        if (this.cleanupPromise) {
          try {
            await this.cleanupPromise;
          } catch (error) {
            zeroconfLog.warn("zeroconf › waiting cleanup failed", { error });
          }
        }

        if (!this.zeroconf) {
          zeroconfLog.warn("zeroconf › not initialized");
          throw new Error("Zeroconf not initialized");
        }

        this.publishedServiceName = service.name;
        this.publishActive = true;

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          let publishTimerId: ReturnType<typeof setTimeout> | undefined;
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          let retries = 0;
          const maxRetries = 1;
          const initialTimeout = 10000;
          const retryDelay = 500;

          const cleanup = () => {
            if (publishTimerId) {
              clearTimeout(publishTimerId);
              publishTimerId = undefined;
            }

            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
            }

            this.zeroconf.removeListener("published", onPublished);
            this.zeroconf.removeListener("error", onError);
          };

          const settle = (callback: () => void) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback();
          };

          const publishNow = () => {
            try {
              this.zeroconf.publishService(
                service.type,
                service.protocol,
                service.domain,
                service.name,
                service.port,
                service.txt
              );
            } catch (error) {
              zeroconfLog.error("zeroconf › publishService call failed", {
                error,
              });
            }
          };

          const scheduleTimeout = () => {
            timeoutId = setTimeout(() => {
              if (retries < maxRetries) {
                retries += 1;
                zeroconfLog.warn("zeroconf › publish timed out, retrying", {
                  serviceName: service.name,
                  attempt: retries,
                });

                try {
                  this.zeroconf.removeListener("error", onError);
                  this.zeroconf.unpublishService(service.name);
                } catch (error) {
                  zeroconfLog.debug("zeroconf › retry unpublish ignored", {
                    error,
                  });
                }

                publishTimerId = setTimeout(() => {
                  this.zeroconf.on("error", onError);
                  publishNow();
                }, retryDelay);

                scheduleTimeout();
                return;
              }

              const error = new Error(
                `Timed out waiting for Zeroconf to publish ${service.name}`
              );
              zeroconfLog.error("zeroconf › publish timed out", {
                serviceName: service.name,
              });
              settle(() => reject(error));
            }, initialTimeout);
          };

          const onPublished = (publishedService: { name?: string }) => {
            if (publishedService?.name !== service.name) {
              return;
            }

            zeroconfLog.info("zeroconf › service published", {
              hasServiceName: Boolean(publishedService?.name),
            });

            settle(resolve);
          };

          const onError = (error: Error) => {
            zeroconfLog.error("zeroconf › publish error", { error });
            settle(() => reject(error));
          };

          this.zeroconf.on("published", onPublished);
          this.zeroconf.on("error", onError);

          publishTimerId = setTimeout(() => {
            publishNow();
          }, 500);
          scheduleTimeout();
        });
      } catch (error) {
        if (this.publishedServiceName === service.name) {
          this.publishedServiceName = undefined;
        }

        zeroconfLog.error("zeroconf › publish failed", { error });
        throw error;
      } finally {
        this.publishActive = false;
      }
    })();

    try {
      await this.publishPromise;
    } finally {
      this.publishPromise = undefined;
    }
  }

  /**
   * Cleans up Zeroconf resources, unpublishes the service, stops scanning, and removes listeners.
   * @param publishedServiceName The name of the published service to unpublish
   * @throws Error if cleanup fails
   */
  async cleanUp(publishedServiceName?: string): Promise<void> {
    if (!this.zeroconf) return;

    if (this.cleanupPromise) return this.cleanupPromise;

    this.cleanupPromise = (async () => {
      try {
        if (this.publishActive && this.publishPromise) {
          try {
            await this.publishPromise;
          } catch (error) {
            zeroconfLog.warn("zeroconf › waiting publish failed", { error });
          }
        }

        const serviceName = publishedServiceName || this.publishedServiceName;

        zeroconfLog.info("zeroconf › unpublish", {
          hasServiceName: Boolean(serviceName),
        });

        if (serviceName) {
          try {
            this.zeroconf.unpublishService(serviceName);
          } catch (error) {
            zeroconfLog.warn("zeroconf › unpublish threw", { error });
          }
        }

        this.stopScan();
        this.zeroconf.removeDeviceListeners();
        this.publishedServiceName = undefined;

        await new Promise((res) => setTimeout(res, 500));

        // Reinitialize so the next publishService/startScan gets a working
        // native event bridge. removeDeviceListeners() above severs it and
        // addDeviceListeners() is never re-called otherwise.
        this.zeroconf = new Zeroconf();
        this.scanListenersAttached = false;

        zeroconfLog.info("zeroconf › cleanup complete");
      } catch (error) {
        zeroconfLog.error("zeroconf › cleanup failed", { error });
        throw error;
      } finally {
        this.cleanupPromise = undefined;
      }
    })();

    return this.cleanupPromise;
  }
}
