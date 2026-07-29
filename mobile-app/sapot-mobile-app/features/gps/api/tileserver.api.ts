import { getTileServerUrl } from "@/config/runtime";
import { apiLog } from "@/features/shared/core/utils/logger";

/**
 * The basemap style descriptor. The map screen renders raster tiles from
 * `/styles/basic-preview/{z}/{x}/{y}.png`, which tileserver-gl derives from
 * this same style — so a 2xx here means the tileserver is up and serving that
 * style. It is probed instead of a tile because it is a fixed, always-present
 * resource, whereas any single {z}/{x}/{y} depends on the loaded mbtiles.
 */
const STYLE_PROBE_PATH = "/styles/basic-preview/style.json";

const PROBE_TIMEOUT_MS = 5000;

/**
 * Reachability probe for the tileserver.
 *
 * The tileserver is a deployment separate from the API (`tileserver/`), so it
 * can be down while `/gps/latest` is perfectly healthy. MapLibre swallows tile
 * fetch failures and exposes no error event for them in
 * `@maplibre/maplibre-react-native`, so the only way to tell the user their
 * basemap is missing is to ask the tileserver directly.
 *
 * Never throws — a failed probe is a `false`, not an error state.
 */
export const checkTileServerReachable = async (): Promise<boolean> => {
  const url = `${getTileServerUrl()}${STYLE_PROBE_PATH}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    apiLog.debug("api › tileserver probe start");
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    apiLog.debug("api › tileserver probe done", { status: res.status });
    return res.ok;
  } catch (error) {
    apiLog.warn("api › tileserver probe failed", { error });
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};
