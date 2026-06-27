import { LivenessMonitor, LivenessMonitorOptions } from "../liveness-monitor";

describe("LivenessMonitor", () => {
  let send: jest.Mock;
  let onLivenessLost: jest.Mock;
  let onLivenessRestored: jest.Mock;
  let log: jest.Mock;
  let monitor: LivenessMonitor;

  function makeMonitor(overrides: Partial<LivenessMonitorOptions> = {}): LivenessMonitor {
    return new LivenessMonitor({
      send,
      onLivenessLost,
      onLivenessRestored,
      log,
      ...overrides,
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    send = jest.fn();
    onLivenessLost = jest.fn();
    onLivenessRestored = jest.fn();
    log = jest.fn();
    monitor = makeMonitor();
  });

  afterEach(() => {
    monitor.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("start / ping scheduling", () => {
    it("sends a ping after the configured interval (4000 ms)", () => {
      monitor.start();
      jest.advanceTimersByTime(4000);
      const pings = send.mock.calls
        .map(([frame]: [unknown]) => frame)
        .filter((f: unknown) => (f as { type: string }).type === "ping");
      expect(pings.length).toBeGreaterThanOrEqual(1);
    });

    it("does not send before the interval elapses", () => {
      monitor.start();
      jest.advanceTimersByTime(3999);
      expect(send).not.toHaveBeenCalled();
    });

    it("sends multiple pings on consecutive intervals", () => {
      monitor.start();
      jest.advanceTimersByTime(4000); // ping 1 + wait pong
      // Respond to avoid degraded-mode scheduling
      monitor.handlePong();
      jest.advanceTimersByTime(4000); // ping 2
      const pings = send.mock.calls
        .map(([f]: [unknown]) => f)
        .filter((f: unknown) => (f as { type: string }).type === "ping");
      expect(pings.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("handlePing", () => {
    it("sends a pong echoing the nonce", () => {
      monitor.start();
      monitor.handlePing(42);
      const pong = send.mock.calls.find(
        ([f]: [unknown]) => (f as { type: string }).type === "pong"
      );
      expect(pong).toBeDefined();
      expect((pong![0] as { data: { nonce: number } }).data.nonce).toBe(42);
    });
  });

  describe("pong timeout / liveness lost", () => {
    it("calls onLivenessLost after maxMissedPongs consecutive timeouts", () => {
      monitor.start();
      // ping #1
      jest.advanceTimersByTime(4000);
      // miss #1 (timeout after 3000 ms)
      jest.advanceTimersByTime(3000);
      // ping #2
      jest.advanceTimersByTime(4000);
      // miss #2 → onLivenessLost
      jest.advanceTimersByTime(3000);

      expect(onLivenessLost).toHaveBeenCalled();
    });

    it("does not call onLivenessLost after only one missed pong", () => {
      monitor.start();
      jest.advanceTimersByTime(4000); // ping #1
      jest.advanceTimersByTime(3000); // miss #1
      expect(onLivenessLost).not.toHaveBeenCalled();
    });
  });

  describe("handlePong / liveness restored", () => {
    it("calls onLivenessRestored when a pong arrives after degradation", () => {
      monitor.start();
      jest.advanceTimersByTime(4000); // ping #1
      jest.advanceTimersByTime(3000); // miss #1
      jest.advanceTimersByTime(4000); // ping #2
      jest.advanceTimersByTime(3000); // miss #2 → degraded

      monitor.handlePong();

      expect(onLivenessRestored).toHaveBeenCalled();
    });

    it("does not call onLivenessRestored when a pong arrives without prior degradation", () => {
      monitor.start();
      jest.advanceTimersByTime(4000); // ping #1 sent
      monitor.handlePong();           // timely pong

      expect(onLivenessRestored).not.toHaveBeenCalled();
    });
  });

  describe("stop", () => {
    it("cancels pending timers so send is not called after stop", () => {
      monitor.start();
      monitor.stop();
      send.mockClear();
      jest.advanceTimersByTime(20000);
      expect(send).not.toHaveBeenCalled();
    });

    it("is safe to call multiple times", () => {
      monitor.start();
      expect(() => {
        monitor.stop();
        monitor.stop();
      }).not.toThrow();
    });
  });
});
