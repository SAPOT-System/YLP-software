import * as Location from "expo-location";
import { gpsLog } from "@/features/shared/utils/logger";

gpsLog.debug("[gps-location-service] module loaded");

const DISTANCE_INTERVAL_METERS = 1;
const RECONNECT_DELAY_MS = 3000;

export class GpsLocationService {
  private ws: WebSocket | null = null;
  private locationSub: Location.LocationSubscription | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  private wsBaseUrl = "";
  private userId = "";

  async start(wsBaseUrl: string, userId: string) {
    if (this.locationSub) {
      gpsLog.warn("gps › start skipped", { reason: "already running" });
      return;
    }

    gpsLog.info("gps › start", { userId });
    this.stopped = false;
    this.wsBaseUrl = wsBaseUrl;
    this.userId = userId;

    this.connectWs();

    try {
      this.locationSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: DISTANCE_INTERVAL_METERS,
        },
        (location) => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            gpsLog.debug("gps › location update dropped", {
              reason: "ws not open",
              readyState: this.ws?.readyState,
            });
            return;
          }
          gpsLog.debug("gps › send location", {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          });
          this.ws.send(
            JSON.stringify({
              lat: location.coords.latitude,
              lng: location.coords.longitude,
            })
          );
        }
      );
      gpsLog.info("gps › location watch started");
    } catch (error) {
      gpsLog.error("gps › watchPositionAsync failed", { error });
      this.stop();
    }
  }

  stop() {
    gpsLog.info("gps › stop");
    this.stopped = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.locationSub?.remove();
    this.locationSub = null;

    this.ws?.close(1000, "client_stopped");
    this.ws = null;
  }

  private connectWs() {
    if (this.stopped) return;

    const url = `${this.wsBaseUrl.replace(/\/+$/, "")}/gps/ws/${this.userId}`;
    gpsLog.info("gps › ws connect", { url });
    const ws = new WebSocket(url);

    ws.onopen = () => {
      gpsLog.info("gps › ws open");
    };

    ws.onerror = (event) => {
      gpsLog.warn("gps › ws error", { event });
      ws.close();
    };

    ws.onclose = (event) => {
      this.ws = null;
      gpsLog.warn("gps › ws closed", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    };

    this.ws = ws;
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    gpsLog.info("gps › ws reconnect scheduled", { delayMs: RECONNECT_DELAY_MS });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      gpsLog.info("gps › ws reconnect attempt");
      this.connectWs();
    }, RECONNECT_DELAY_MS);
  }
}
