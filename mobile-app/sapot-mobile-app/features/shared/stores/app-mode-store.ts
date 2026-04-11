import { modeLog } from "../utils/logger";
modeLog.debug("[app-mode-store] module loaded");

export type AppMode = "auto" | "server" | "lan";

type AppModeListener = () => void;

type ModeCapabilities = {
  tcp: boolean;
  websocket: boolean;
  zeroconf: boolean;
};

export class AppModeStore {
  private _mode: AppMode = "auto";
  private listeners = new Set<AppModeListener>();

  get mode(): AppMode {
    return this._mode;
  }

  setMode(mode: AppMode) {
    if (this._mode === mode) return;
    modeLog.info("mode › set", { from: this._mode, to: mode });
    this._mode = mode;
    this.emit();
  }

  subscribe(listener: AppModeListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isModeAllowed(mode: AppMode, isGuest: boolean): boolean {
    if (isGuest) {
      return mode === "lan";
    }

    return true;
  }

  getEffectiveMode(isGuest: boolean): AppMode {
    if (isGuest) {
      return "lan";
    }
    return this._mode;
  }

  getCapabilities(isGuest: boolean): ModeCapabilities {
    const mode = this.getEffectiveMode(isGuest);

    switch (mode) {
      case "server":
        return { tcp: false, websocket: true, zeroconf: false };
      case "lan":
        return { tcp: true, websocket: false, zeroconf: true };
      case "auto":
      default:
        return { tcp: true, websocket: true, zeroconf: true };
    }
  }

  isTcpAllowed(isGuest: boolean): boolean {
    return this.getCapabilities(isGuest).tcp;
  }

  isWebSocketAllowed(isGuest: boolean): boolean {
    return this.getCapabilities(isGuest).websocket;
  }

  isZeroconfAllowed(isGuest: boolean): boolean {
    return this.getCapabilities(isGuest).zeroconf;
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}
