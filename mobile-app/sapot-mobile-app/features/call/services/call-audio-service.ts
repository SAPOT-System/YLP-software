import { callLog } from "@/features/shared/utils/logger";
import { TypedEventEmitter } from "@/features/shared/utils/typed-event-emitter";
import { DeviceEventEmitter, EmitterSubscription } from "react-native";
import InCallManager from "react-native-incall-manager";
import { AudioRouteTypes } from "./call-service";

export type CallAudioEvents = {
  "audio-routes-updated": [
    { routes: { type: AudioRouteTypes; label: string }[] }
  ];
  "audio-route-changed": [
    {
      route: AudioRouteTypes;
      available: { type: AudioRouteTypes; label: string }[];
    }
  ];
};

/**
 * CallAudioService manages audio routing state and device event subscriptions
 * for in-call audio (earpiece, speaker, headset, bluetooth).
 */
export class CallAudioService extends TypedEventEmitter<CallAudioEvents> {
  private currentAudioRoute: AudioRouteTypes = "speaker";
  private availableRoutes: { type: AudioRouteTypes; label: string }[] = [];
  private isBluetoothConnected = false;
  private isHeadsetConnected = false;
  private audioSubscriptions: EmitterSubscription[] = [];
  private initialRouteSetFor: Set<string> = new Set();

  setupAudioEventListeners() {
    if (this.audioSubscriptions.length > 0) return;

    const wiredSub = DeviceEventEmitter.addListener("WiredHeadset", (data) => {
      callLog.info("call › wired headset event:", data);
      this.isHeadsetConnected = data.device === "WiredHeadset";
      this.updateAvailableRoutes();
      if (this.isHeadsetConnected) {
        this.setAudioRoute("headset");
      }
    });

    const bluetoothSub = DeviceEventEmitter.addListener("BluetoothHeadset", (data) => {
      callLog.info("call › bluetooth headset event:", data);
      this.isBluetoothConnected = data.device === "BluetoothHeadset";
      this.updateAvailableRoutes();
      if (this.isBluetoothConnected) {
        this.setAudioRoute("bluetooth");
      }
    });

    const proximitySub = DeviceEventEmitter.addListener("Proximity", (data) => {
      if (data.isNear) {
        if (
          this.currentAudioRoute !== "earpiece" &&
          this.currentAudioRoute !== "headset" &&
          this.currentAudioRoute !== "bluetooth"
        ) {
          this.setAudioRoute("earpiece");
        }
      }
    });

    this.audioSubscriptions = [wiredSub, bluetoothSub, proximitySub];
    callLog.debug("call › audio event listeners registered");
  }

  removeAudioEventListeners() {
    for (const sub of this.audioSubscriptions) {
      sub.remove();
    }
    this.audioSubscriptions = [];
    callLog.debug("call › audio event listeners removed");
  }

  updateAvailableRoutes() {
    const routes: { type: AudioRouteTypes; label: string }[] = [];

    // Always available
    routes.push({ type: "earpiece", label: "Earpiece" });
    routes.push({ type: "speaker", label: "Speaker" });

    // Check for headset (platform-specific)
    if (this.isHeadsetConnected) {
      routes.push({ type: "headset", label: "Wired Headset" });
    }

    // Check for Bluetooth
    if (this.isBluetoothConnected) {
      routes.push({ type: "bluetooth", label: "Bluetooth" });
    }

    this.availableRoutes = routes;
    this.emit("audio-routes-updated", {
      routes: this.availableRoutes,
    });
  }

  async setAudioRoute(route: AudioRouteTypes) {
    callLog.debug("call › setting audio route to:", route);

    switch (route) {
      case "speaker":
        InCallManager.setForceSpeakerphoneOn(true);
        this.currentAudioRoute = "speaker";
        break;

      case "earpiece":
        InCallManager.setForceSpeakerphoneOn(false);
        this.currentAudioRoute = "earpiece";
        break;

      case "headset":
        // For wired headsets, just turn off speaker - system auto-routes
        InCallManager.setForceSpeakerphoneOn(false);
        this.currentAudioRoute = "headset";
        break;

      case "bluetooth":
        // For Bluetooth, ensure SCO is enabled for call audio
        InCallManager.setForceSpeakerphoneOn(false);
        // Note: On some Android versions, additional native code may be needed
        this.currentAudioRoute = "bluetooth";
        break;

      default:
        callLog.warn("call › unknown audio route:", route);
    }

    this.emit("audio-route-changed", {
      route: this.currentAudioRoute,
      available: this.availableRoutes,
    });
  }

  toggleSpeaker() {
    const newRoute =
      this.currentAudioRoute === "speaker" ? "earpiece" : "speaker";
    this.setAudioRoute(newRoute);
  }

  getInitialRouteSetFor(): Set<string> {
    return this.initialRouteSetFor;
  }

  hasInitialRouteFor(peerId: string): boolean {
    return this.initialRouteSetFor.has(peerId);
  }

  markInitialRouteSet(peerId: string) {
    this.initialRouteSetFor.add(peerId);
  }

  clearInitialRouteFor(peerId: string) {
    this.initialRouteSetFor.delete(peerId);
  }
}
