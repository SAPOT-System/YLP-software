import { EventEmitter } from "events";
import { FaultInjector } from "../fault-injector";

jest.mock("@/config/debug", () => ({ IS_DEBUG_ENABLED: false }));

describe("FaultInjector — debug mode disabled", () => {
  it("wrapAdapter returns the exact same instance, untouched", () => {
    const injector = new FaultInjector();
    const adapter = new EventEmitter() as EventEmitter & {
      sendMessage: jest.Mock;
    };
    adapter.sendMessage = jest.fn();
    const originalSendMessage = adapter.sendMessage;
    const originalEmit = adapter.emit;

    const wrapped = injector.wrapAdapter(adapter, "tcp");

    expect(wrapped).toBe(adapter);
    expect(adapter.sendMessage).toBe(originalSendMessage);
    expect(adapter.emit).toBe(originalEmit);
  });
});
