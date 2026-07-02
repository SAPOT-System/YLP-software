import { TypedEventEmitter } from "../typed-event-emitter";

type TestEvents = {
  greet: [name: string];
  ping: [];
  data: [payload: { id: number; value: string }];
};

describe("TypedEventEmitter", () => {
  let emitter: TypedEventEmitter<TestEvents>;

  beforeEach(() => {
    emitter = new TypedEventEmitter<TestEvents>();
  });

  it("calls a listener with the correct arguments", () => {
    const listener = jest.fn();
    emitter.on("greet", listener);
    emitter.emit("greet", "Alice");
    expect(listener).toHaveBeenCalledWith("Alice");
  });

  it("calls a no-arg listener", () => {
    const listener = jest.fn();
    emitter.on("ping", listener);
    emitter.emit("ping");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("calls an object-payload listener with the correct payload", () => {
    const listener = jest.fn();
    emitter.on("data", listener);
    emitter.emit("data", { id: 1, value: "hello" });
    expect(listener).toHaveBeenCalledWith({ id: 1, value: "hello" });
  });

  it("calls all registered listeners for an event", () => {
    const a = jest.fn();
    const b = jest.fn();
    emitter.on("greet", a);
    emitter.on("greet", b);
    emitter.emit("greet", "Bob");
    expect(a).toHaveBeenCalledWith("Bob");
    expect(b).toHaveBeenCalledWith("Bob");
  });

  it("once listener fires exactly once", () => {
    const listener = jest.fn();
    emitter.once("greet", listener);
    emitter.emit("greet", "A");
    emitter.emit("greet", "B");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("A");
  });

  it("removeAllListeners stops all listeners for an event", () => {
    const listener = jest.fn();
    emitter.on("greet", listener);
    emitter.removeAllListeners("greet");
    emitter.emit("greet", "Carol");
    expect(listener).not.toHaveBeenCalled();
  });
});
