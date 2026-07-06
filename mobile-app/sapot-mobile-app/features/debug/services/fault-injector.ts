import { EventEmitter } from "events";
import { IS_DEBUG_ENABLED } from "@/config/debug";
import { faultLog } from "@/features/shared/core/utils/logger";

export type OfflineFlag =
  | "noInternet"
  | "lanDown"
  | "serverDown"
  | "redisDown"
  | "authDown"
  | "syncDown";

export type NetworkTransport = "tcp" | "ws";

export interface NetworkFaultConfig {
  latencyMs: number;
  lossRate: number;
  dupRate: number;
  corruptRate: number;
}

type Listener = () => void;

interface WrappableAdapter extends EventEmitter {
  sendMessage?(message: unknown): void;
}

const DEFAULT_NETWORK_FAULTS: NetworkFaultConfig = {
  latencyMs: 0,
  lossRate: 0,
  dupRate: 0,
  corruptRate: 0,
};

const DEFAULT_OFFLINE_FLAGS: Record<OfflineFlag, boolean> = {
  noInternet: false,
  lanDown: false,
  serverDown: false,
  redisDown: false,
  authDown: false,
  syncDown: false,
};

function rollFault(rate: number): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return Math.random() < rate;
}

/**
 * Debug-only fault injection over the connection layer. wrapAdapter() monkey-patches
 * the given adapter instance's .emit("data", ...) and .sendMessage() so faults apply
 * without any change to the adapter's own source (tcp-client-adapter.ts etc. are the
 * highest-blast-radius files in this codebase per CLAUDE.md). It is a true no-op — the
 * same instance, untouched — whenever IS_DEBUG_ENABLED is false.
 */
export class FaultInjector {
  private offlineFlagsSnapshot: Record<OfflineFlag, boolean> = {
    ...DEFAULT_OFFLINE_FLAGS,
  };

  private networkFaultsSnapshot: Record<NetworkTransport, NetworkFaultConfig> = {
    tcp: DEFAULT_NETWORK_FAULTS,
    ws: DEFAULT_NETWORK_FAULTS,
  };

  private listeners = new Set<Listener>();

  getOfflineFlags(): Record<OfflineFlag, boolean> {
    return this.offlineFlagsSnapshot;
  }

  setOfflineFlag(flag: OfflineFlag, value: boolean): void {
    if (this.offlineFlagsSnapshot[flag] === value) return;
    this.offlineFlagsSnapshot = { ...this.offlineFlagsSnapshot, [flag]: value };
    faultLog.info("fault › offline flag set", { flag, value });
    this.notify();
  }

  getNetworkFaults(transport: NetworkTransport): NetworkFaultConfig {
    return this.networkFaultsSnapshot[transport];
  }

  setNetworkFaults(
    transport: NetworkTransport,
    config: Partial<NetworkFaultConfig>
  ): void {
    this.networkFaultsSnapshot = {
      ...this.networkFaultsSnapshot,
      [transport]: { ...this.networkFaultsSnapshot[transport], ...config },
    };
    faultLog.info("fault › network faults set", { transport, config });
    this.notify();
  }

  resetNetworkFaults(transport: NetworkTransport): void {
    this.networkFaultsSnapshot = {
      ...this.networkFaultsSnapshot,
      [transport]: DEFAULT_NETWORK_FAULTS,
    };
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  wrapAdapter<T extends WrappableAdapter>(adapter: T, transport: NetworkTransport): T {
    if (!IS_DEBUG_ENABLED) return adapter;

    if (typeof adapter.emit === "function") {
      const originalEmit = adapter.emit.bind(adapter);
      adapter.emit = ((event: string | symbol, ...args: unknown[]) => {
        if (event !== "data") return originalEmit(event, ...args);
        this.deliver(transport, args[0], (payload) => originalEmit("data", payload));
        return true;
      }) as typeof adapter.emit;
    }

    if (typeof adapter.sendMessage === "function") {
      const originalSend = adapter.sendMessage.bind(adapter);
      adapter.sendMessage = ((message: unknown) => {
        this.deliver(transport, message, originalSend);
      }) as typeof adapter.sendMessage;
    }

    return adapter;
  }

  private isTransportDown(transport: NetworkTransport): boolean {
    const flags = this.offlineFlagsSnapshot;
    if (flags.noInternet) return true;
    if (transport === "tcp" && flags.lanDown) return true;
    if (transport === "ws" && flags.serverDown) return true;
    return false;
  }

  private deliver(
    transport: NetworkTransport,
    message: unknown,
    send: (message: unknown) => void
  ): void {
    if (this.isTransportDown(transport)) {
      faultLog.debug("fault › traffic dropped (transport down)", { transport });
      return;
    }

    const faults = this.networkFaultsSnapshot[transport];

    if (rollFault(faults.lossRate)) {
      faultLog.debug("fault › packet dropped", { transport });
      return;
    }

    const payload = rollFault(faults.corruptRate) ? this.corrupt(message) : message;

    const dispatch = () => {
      send(payload);
      if (rollFault(faults.dupRate)) send(payload);
    };

    if (faults.latencyMs > 0) {
      setTimeout(dispatch, faults.latencyMs);
    } else {
      dispatch();
    }
  }

  private corrupt(message: unknown): unknown {
    if (typeof message !== "object" || message === null) return message;
    const clone: Record<string, unknown> = { ...(message as Record<string, unknown>) };
    const stringKeys = Object.keys(clone).filter((key) => typeof clone[key] === "string");
    const stringKey =
      stringKeys.find((key) => key === "content") ?? stringKeys[0];
    if (!stringKey) return clone;
    clone[stringKey] = ` CORRUPTED ${clone[stringKey]}`;
    return clone;
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const faultInjector = new FaultInjector();
