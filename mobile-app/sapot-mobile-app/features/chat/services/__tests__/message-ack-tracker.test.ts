import { MessageAckTracker } from "../message-ack-tracker";

describe("MessageAckTracker", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("fires onTimeout after the delay when not cleared", () => {
    const tracker = new MessageAckTracker();
    const onTimeout = jest.fn();
    tracker.arm("m1", onTimeout, 12000);
    jest.advanceTimersByTime(12000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("does not fire after clear()", () => {
    const tracker = new MessageAckTracker();
    const onTimeout = jest.fn();
    tracker.arm("m1", onTimeout, 12000);
    tracker.clear("m1");
    jest.advanceTimersByTime(12000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("clearAll() cancels every armed timeout", () => {
    const tracker = new MessageAckTracker();
    const a = jest.fn();
    const b = jest.fn();
    tracker.arm("m1", a, 1000);
    tracker.arm("m2", b, 1000);
    tracker.clearAll();
    jest.advanceTimersByTime(1000);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });
});
