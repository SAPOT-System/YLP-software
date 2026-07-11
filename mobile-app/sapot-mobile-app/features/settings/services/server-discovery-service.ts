import { ZeroconfAdapter } from "@/features/shared/connection/adapters";
import { discoveryLog } from "@/features/shared/core/utils/logger";
import type { Service } from "react-native-zeroconf";

const SERVER_SERVICE_TYPE = "sapot-server";
const SERVER_SERVICE_PROTOCOL = "tcp";
const SERVER_SERVICE_DOMAIN = "local.";

export interface DiscoveredServer {
  ip: string;
  caFp?: string;
}

/**
 * Reports whether a resolved mDNS service looks like the advertised SAPOT
 * server (`_sapot-server._tcp.local.`) rather than a stray resolve from
 * another scan. `fullName` is optional on the wire, so services without it
 * are accepted rather than dropped.
 */
function looksLikeServerService(service: Service): boolean {
  if (!service.fullName) return true;
  return service.fullName.includes(`_${SERVER_SERVICE_TYPE}.`);
}

/**
 * Browses for the SAPOT server's mDNS advertisement
 * (`_sapot-server._tcp.local.`, see `docs/deployment/runbooks.md`) and
 * resolves with its IP and (if advertised) CA fingerprint.
 *
 * Reuses the given `ZeroconfAdapter`'s single underlying `Zeroconf` instance
 * — it does NOT create a second native Zeroconf instance. Because the
 * underlying native `scan()` call stops any scan currently in progress
 * (including the standing "lanchat" peer-discovery browse), this function
 * restarts that peer-discovery scan afterward if it was active before the
 * call, so this one-off lookup doesn't leave peer discovery stopped.
 *
 * Resolves `null` if no matching service is found before `timeoutMs`
 * elapses. Always removes its own event listener before resolving — never
 * leaves a dangling listener on the shared adapter.
 */
export async function discoverServerIp(
  adapter: ZeroconfAdapter,
  timeoutMs: number
): Promise<DiscoveredServer | null> {
  const wasPeerScanning = adapter.isScanning();

  return new Promise<DiscoveredServer | null>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const onResolved = (service: Service) => {
      if (!looksLikeServerService(service)) return;

      const ip = service.addresses?.[0];
      if (!ip) {
        discoveryLog.warn("server-discovery › resolved service missing address", {
          serviceName: service.name,
        });
        return;
      }

      const caFp =
        typeof service.txt?.caFp === "string" ? service.txt.caFp : undefined;

      discoveryLog.info("server-discovery › server resolved", {
        hasCaFp: Boolean(caFp),
      });

      settle({ ip, caFp });
    };

    const cleanup = () => {
      adapter.removeListener("serviceResolved", onResolved);
      clearTimeout(timer);

      if (wasPeerScanning) {
        try {
          adapter.restartScan();
        } catch (error) {
          discoveryLog.warn("server-discovery › failed to restore peer scan", {
            error,
          });
        }
      }
    };

    const settle = (result: DiscoveredServer | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    adapter.on("serviceResolved", onResolved);

    timer = setTimeout(() => {
      discoveryLog.info("server-discovery › timed out", { timeoutMs });
      settle(null);
    }, timeoutMs);

    try {
      adapter.scan(SERVER_SERVICE_TYPE, SERVER_SERVICE_PROTOCOL, SERVER_SERVICE_DOMAIN);
    } catch (error) {
      discoveryLog.error("server-discovery › scan failed to start", { error });
      settle(null);
    }
  });
}
