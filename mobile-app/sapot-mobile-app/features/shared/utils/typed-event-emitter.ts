import { EventEmitter } from "events";
import baseLogger from "./logger";

const utilLog = baseLogger.extend("util");
utilLog.debug("[typed-event-emitter] module loaded");

/**
 * A typed wrapper around Node's EventEmitter.
 *
 * TEvents maps each event name to a tuple of its argument types:
 *   type MyEvents = {
 *     greet: [name: string];
 *     ping:  [];
 *   };
 */
export class TypedEventEmitter<
  TEvents extends Record<string, unknown[]>,
> extends EventEmitter {
  emit<K extends keyof TEvents & string>(
    event: K,
    ...args: TEvents[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof TEvents & string>(
    event: K,
    listener: (...args: TEvents[K]) => void
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  once<K extends keyof TEvents & string>(
    event: K,
    listener: (...args: TEvents[K]) => void
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  removeAllListeners<K extends keyof TEvents & string>(event?: K): this {
    return super.removeAllListeners(event);
  }
}
