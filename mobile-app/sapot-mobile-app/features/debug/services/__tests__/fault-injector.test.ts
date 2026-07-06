import { EventEmitter } from "events";
import { FaultInjector } from "../fault-injector";

jest.mock("@/config/debug", () => ({ IS_DEBUG_ENABLED: true }));

function createAdapter() {
  const adapter = new EventEmitter() as EventEmitter & {
    sendMessage: jest.Mock;
  };
  const originalSendMessage = jest.fn();
  adapter.sendMessage = originalSendMessage;
  return { adapter, originalSendMessage };
}

describe("FaultInjector", () => {
  let injector: FaultInjector;

  beforeEach(() => {
    injector = new FaultInjector();
  });

  describe("offline flags", () => {
    it("defaults every offline flag to false", () => {
      expect(injector.getOfflineFlags()).toEqual({
        noInternet: false,
        lanDown: false,
        serverDown: false,
        redisDown: false,
        authDown: false,
        syncDown: false,
      });
    });

    it("sets and reads an individual offline flag", () => {
      injector.setOfflineFlag("serverDown", true);
      expect(injector.getOfflineFlags().serverDown).toBe(true);
    });

    it("returns a referentially stable snapshot when nothing changed", () => {
      const first = injector.getOfflineFlags();
      const second = injector.getOfflineFlags();
      expect(first).toBe(second);
    });

    it("returns a new snapshot reference after a flag changes", () => {
      const before = injector.getOfflineFlags();
      injector.setOfflineFlag("authDown", true);
      expect(injector.getOfflineFlags()).not.toBe(before);
    });

    it("notifies subscribers when a flag changes", () => {
      const listener = jest.fn();
      injector.subscribe(listener);
      injector.setOfflineFlag("noInternet", true);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("does not notify subscribers when setting the same value again", () => {
      injector.setOfflineFlag("noInternet", true);
      const listener = jest.fn();
      injector.subscribe(listener);
      injector.setOfflineFlag("noInternet", true);
      expect(listener).not.toHaveBeenCalled();
    });

    it("stops notifying after unsubscribe", () => {
      const listener = jest.fn();
      const unsubscribe = injector.subscribe(listener);
      unsubscribe();
      injector.setOfflineFlag("redisDown", true);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("network faults", () => {
    it("defaults every transport to zero faults", () => {
      expect(injector.getNetworkFaults("tcp")).toEqual({
        latencyMs: 0,
        lossRate: 0,
        dupRate: 0,
        corruptRate: 0,
      });
      expect(injector.getNetworkFaults("ws")).toEqual({
        latencyMs: 0,
        lossRate: 0,
        dupRate: 0,
        corruptRate: 0,
      });
    });

    it("merges partial fault config for a transport", () => {
      injector.setNetworkFaults("tcp", { lossRate: 0.5 });
      expect(injector.getNetworkFaults("tcp")).toEqual({
        latencyMs: 0,
        lossRate: 0.5,
        dupRate: 0,
        corruptRate: 0,
      });
    });

    it("does not let one transport's faults affect the other", () => {
      injector.setNetworkFaults("tcp", { lossRate: 1 });
      expect(injector.getNetworkFaults("ws").lossRate).toBe(0);
    });

    it("resets a transport back to defaults", () => {
      injector.setNetworkFaults("ws", { latencyMs: 500 });
      injector.resetNetworkFaults("ws");
      expect(injector.getNetworkFaults("ws")).toEqual({
        latencyMs: 0,
        lossRate: 0,
        dupRate: 0,
        corruptRate: 0,
      });
    });
  });

  describe("wrapAdapter — defensive guards", () => {
    it("does not throw when the adapter has no emit function (e.g. a plain test double)", () => {
      const bareAdapter = { sendMessage: jest.fn() } as unknown as EventEmitter & {
        sendMessage: jest.Mock;
      };

      expect(() => injector.wrapAdapter(bareAdapter, "tcp")).not.toThrow();
    });

    it("still wraps sendMessage when the adapter has no emit function", () => {
      const originalSendMessage = jest.fn();
      const bareAdapter = { sendMessage: originalSendMessage } as unknown as EventEmitter & {
        sendMessage: jest.Mock;
      };
      injector.setOfflineFlag("noInternet", true);

      const wrapped = injector.wrapAdapter(bareAdapter, "tcp");
      wrapped.sendMessage({ type: "chat" });

      expect(originalSendMessage).not.toHaveBeenCalled();
    });
  });

  describe("wrapAdapter — outbound (sendMessage)", () => {
    it("delivers outbound messages unchanged when no faults are configured", () => {
      const { adapter, originalSendMessage } = createAdapter();
      const wrapped = injector.wrapAdapter(adapter, "tcp");

      wrapped.sendMessage({ type: "chat", content: "hi" });

      expect(originalSendMessage).toHaveBeenCalledTimes(1);
      expect(originalSendMessage).toHaveBeenCalledWith({
        type: "chat",
        content: "hi",
      });
    });

    it("drops outbound messages entirely when lossRate is 1", () => {
      const { adapter, originalSendMessage } = createAdapter();
      injector.setNetworkFaults("tcp", { lossRate: 1 });
      const wrapped = injector.wrapAdapter(adapter, "tcp");

      wrapped.sendMessage({ type: "chat" });

      expect(originalSendMessage).not.toHaveBeenCalled();
    });

    it("duplicates outbound messages when dupRate is 1", () => {
      const { adapter, originalSendMessage } = createAdapter();
      injector.setNetworkFaults("tcp", { dupRate: 1 });
      const wrapped = injector.wrapAdapter(adapter, "tcp");

      wrapped.sendMessage({ type: "chat" });

      expect(originalSendMessage).toHaveBeenCalledTimes(2);
    });

    it("corrupts a string field of outbound messages when corruptRate is 1", () => {
      const { adapter, originalSendMessage } = createAdapter();
      injector.setNetworkFaults("tcp", { corruptRate: 1 });
      const wrapped = injector.wrapAdapter(adapter, "tcp");

      wrapped.sendMessage({ type: "chat", content: "hi" });

      const [sentMessage] = originalSendMessage.mock.calls[0];
      expect(sentMessage.content).not.toBe("hi");
      expect(sentMessage.type).toBe("chat");
    });

    it("leaves the message unchanged when corruption finds no string field", () => {
      const { adapter, originalSendMessage } = createAdapter();
      injector.setNetworkFaults("tcp", { corruptRate: 1 });
      const wrapped = injector.wrapAdapter(adapter, "tcp");

      wrapped.sendMessage({ count: 5 });

      expect(originalSendMessage).toHaveBeenCalledWith({ count: 5 });
    });

    it("delays outbound messages by latencyMs", () => {
      jest.useFakeTimers();
      const { adapter, originalSendMessage } = createAdapter();
      injector.setNetworkFaults("tcp", { latencyMs: 300 });
      const wrapped = injector.wrapAdapter(adapter, "tcp");

      wrapped.sendMessage({ type: "chat" });
      expect(originalSendMessage).not.toHaveBeenCalled();

      jest.advanceTimersByTime(300);
      expect(originalSendMessage).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it("drops outbound tcp traffic entirely when lanDown is set", () => {
      const { adapter, originalSendMessage } = createAdapter();
      injector.setOfflineFlag("lanDown", true);
      const wrapped = injector.wrapAdapter(adapter, "tcp");

      wrapped.sendMessage({ type: "chat" });

      expect(originalSendMessage).not.toHaveBeenCalled();
    });

    it("does not drop ws traffic when lanDown is set (lanDown only affects tcp)", () => {
      const { adapter, originalSendMessage } = createAdapter();
      injector.setOfflineFlag("lanDown", true);
      const wrapped = injector.wrapAdapter(adapter, "ws");

      wrapped.sendMessage({ type: "chat" });

      expect(originalSendMessage).toHaveBeenCalledTimes(1);
    });

    it("drops outbound ws traffic entirely when serverDown is set", () => {
      const { adapter, originalSendMessage } = createAdapter();
      injector.setOfflineFlag("serverDown", true);
      const wrapped = injector.wrapAdapter(adapter, "ws");

      wrapped.sendMessage({ type: "chat" });

      expect(originalSendMessage).not.toHaveBeenCalled();
    });

    it("drops outbound traffic on any transport when noInternet is set", () => {
      const { adapter, originalSendMessage } = createAdapter();
      injector.setOfflineFlag("noInternet", true);
      const wrapped = injector.wrapAdapter(adapter, "ws");

      wrapped.sendMessage({ type: "chat" });

      expect(originalSendMessage).not.toHaveBeenCalled();
    });
  });

  describe("wrapAdapter — inbound (emit \"data\")", () => {
    it("delivers data events unchanged when no faults are configured", () => {
      const { adapter } = createAdapter();
      const wrapped = injector.wrapAdapter(adapter, "tcp");
      const listener = jest.fn();
      wrapped.on("data", listener);

      wrapped.emit("data", { type: "chat", content: "hi" });

      expect(listener).toHaveBeenCalledWith({ type: "chat", content: "hi" });
    });

    it("does not intercept non-data events", () => {
      const { adapter } = createAdapter();
      const wrapped = injector.wrapAdapter(adapter, "tcp");
      const listener = jest.fn();
      wrapped.on("connected", listener);

      wrapped.emit("connected");

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("drops data events when lossRate is 1", () => {
      const { adapter } = createAdapter();
      injector.setNetworkFaults("tcp", { lossRate: 1 });
      const wrapped = injector.wrapAdapter(adapter, "tcp");
      const listener = jest.fn();
      wrapped.on("data", listener);

      wrapped.emit("data", { type: "chat" });

      expect(listener).not.toHaveBeenCalled();
    });

    it("duplicates data events when dupRate is 1", () => {
      const { adapter } = createAdapter();
      injector.setNetworkFaults("tcp", { dupRate: 1 });
      const wrapped = injector.wrapAdapter(adapter, "tcp");
      const listener = jest.fn();
      wrapped.on("data", listener);

      wrapped.emit("data", { type: "chat" });

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("drops inbound data on any transport when noInternet is set", () => {
      const { adapter } = createAdapter();
      injector.setOfflineFlag("noInternet", true);
      const wrapped = injector.wrapAdapter(adapter, "tcp");
      const listener = jest.fn();
      wrapped.on("data", listener);

      wrapped.emit("data", { type: "chat" });

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
