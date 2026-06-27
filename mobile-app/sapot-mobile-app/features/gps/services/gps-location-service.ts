import * as Location from "expo-location";
import { toAppError } from "@/features/shared/core/errors";
import { gpsLog } from "@/features/shared/core/utils/logger";
import { haversineMeters } from "../utils/haversine";

gpsLog.debug("[gps-location-service] module loaded");

const DISTANCE_INTERVAL_METERS = 10;
const MIN_SEND_INTERVAL_MS = 3_000;
const SIGNIFICANT_MOVE_METERS = 10;
const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_DELAY_MS = 3_000;

export class GpsLocationService {
  private ws: WebSocket | null = null;
  private locationSub: Location.LocationSubscription | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  private wsBaseUrl = "";
  private userId = "";
  private token = "";

  private lastSentAt: number = 0;
  private lastSentLat: number | null = null;
  private lastSentLng: number | null = null;
  private pendingCoords: { lat: number; lng: number } | null = null;

  async start(wsBaseUrl: string, userId: string, token: string) {
    if (this.locationSub) {
      gpsLog.warn("gps › start skipped", { reason: "already running" });
      return;
    }

    gpsLog.info("gps › start", { userId });
    this.stopped = false;
    this.wsBaseUrl = wsBaseUrl;
    this.userId = userId;
    this.token = token;

    this.connectWs();

    try {
      this.locationSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: DISTANCE_INTERVAL_METERS,
        },
        (location) => this.maybeSend(location)
      );
      gpsLog.info("gps › location watch started");
      this.startHeartbeat();
    } catch (error) {
      const appErr = toAppError(error, "gps");
      gpsLog.error("gps › watchPositionAsync failed", appErr);
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

    this.clearHeartbeat();

    this.locationSub?.remove();
    this.locationSub = null;

    this.ws?.close(1000, "client_stopped");
    this.ws = null;

    this.lastSentAt = 0;
    this.lastSentLat = null;
    this.lastSentLng = null;
    this.pendingCoords = null;
  }

  private maybeSend(location: Location.LocationObject) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      const { latitude: lat, longitude: lng } = location.coords;
      if (this.lastSentLat === null) {
        this.pendingCoords = { lat, lng };
        gpsLog.debug("gps › location buffered (ws not open yet)");
      } else {
        gpsLog.debug("gps › location update dropped", {
          reason: "ws not open",
          readyState: this.ws?.readyState,
        });
      }
      return;
    }

    const now = Date.now();
    const { latitude: lat, longitude: lng } = location.coords;

    if (now - this.lastSentAt < MIN_SEND_INTERVAL_MS) {
      gpsLog.debug("gps › send skipped (time throttle)");
      return;
    }

    if (this.lastSentLat !== null && this.lastSentLng !== null) {
      const dist = haversineMeters(this.lastSentLat, this.lastSentLng, lat, lng);
      if (dist < SIGNIFICANT_MOVE_METERS) {
        gpsLog.debug("gps › send skipped (< 10m)", { dist });
        return;
      }
    }

    this.sendCoords(lat, lng);
  }

  private sendCoords(lat: number, lng: number) {
    this.ws!.send(JSON.stringify({ lat, lng }));
    this.lastSentAt = Date.now();
    this.lastSentLat = lat;
    this.lastSentLng = lng;
    gpsLog.debug("gps › sent location", { lat, lng });
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.lastSentLat === null || this.ws?.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastSentAt >= HEARTBEAT_INTERVAL_MS) {
        gpsLog.debug("gps › heartbeat send");
        this.sendCoords(this.lastSentLat, this.lastSentLng!);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private connectWs() {
    if (this.stopped) return;

    const base = this.wsBaseUrl.replace(/\/+$/, "");
    const url = `${base}/gps/ws/${this.userId}?token=${encodeURIComponent(this.token)}`;
    gpsLog.info("gps › ws connect", { url });
    const ws = new WebSocket(url);

    ws.onopen = () => {
      gpsLog.info("gps › ws open");
      if (this.pendingCoords) {
        this.sendCoords(this.pendingCoords.lat, this.pendingCoords.lng);
        this.pendingCoords = null;
      }
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
      // 1008 = policy violation (auth rejected), 4004 = user not found — do not retry
      if (event.code === 1008 || event.code === 4004) {
        gpsLog.error("gps › ws permanent failure, stopping", { code: event.code });
        this.stop();
        return;
      }
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
