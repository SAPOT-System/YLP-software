import {
  dedupeCandidateAddresses,
  resolveSignalingTransport,
  resolveConnectTimeoutMs,
  shouldRetryConnect,
  removeAdapterListener,
  LAN_CONNECT_TIMEOUT_MS,
  SERVER_CONNECT_TIMEOUT_MS,
  AUTO_CONNECT_TIMEOUT_MS,
} from "../connect-planning";

describe("dedupeCandidateAddresses", () => {
  it("puts the preferred ipAddress first and de-duplicates", () => {
    expect(dedupeCandidateAddresses("10.0.0.1", ["10.0.0.2", "10.0.0.1"])).toEqual([
      "10.0.0.1",
      "10.0.0.2",
    ]);
  });

  it("drops falsy values and handles undefined inputs", () => {
    expect(dedupeCandidateAddresses(undefined, undefined)).toEqual([]);
    expect(dedupeCandidateAddresses("", ["10.0.0.2"])).toEqual(["10.0.0.2"]);
  });
});

describe("resolveSignalingTransport", () => {
  it("prefers ws when ws is configured", () => {
    expect(resolveSignalingTransport(true, true)).toBe("ws");
    expect(resolveSignalingTransport(true, false)).toBe("ws");
  });

  it("falls back to tcp when ws not configured but tcp allowed", () => {
    expect(resolveSignalingTransport(false, true)).toBe("tcp");
  });

  it("returns none when neither is available", () => {
    expect(resolveSignalingTransport(false, false)).toBe("none");
  });
});

describe("resolveConnectTimeoutMs", () => {
  it("uses per-mode timeouts", () => {
    expect(resolveConnectTimeoutMs("lan")).toBe(LAN_CONNECT_TIMEOUT_MS);
    expect(resolveConnectTimeoutMs("server")).toBe(SERVER_CONNECT_TIMEOUT_MS);
    expect(resolveConnectTimeoutMs("auto")).toBe(AUTO_CONNECT_TIMEOUT_MS);
  });
});

describe("shouldRetryConnect", () => {
  it("retries once when a signaling transport exists", () => {
    expect(shouldRetryConnect(0, "ws")).toBe(true);
    expect(shouldRetryConnect(0, "tcp")).toBe(true);
  });

  it("does not retry past the limit or with no transport", () => {
    expect(shouldRetryConnect(1, "ws")).toBe(false);
    expect(shouldRetryConnect(0, "none")).toBe(false);
  });
});

describe("removeAdapterListener", () => {
  it("uses off when present", () => {
    const off = jest.fn();
    const cb = jest.fn();
    removeAdapterListener({ off }, "connection-failed", cb);
    expect(off).toHaveBeenCalledWith("connection-failed", cb);
  });

  it("falls back to removeListener when off is absent", () => {
    const removeListener = jest.fn();
    const cb = jest.fn();
    removeAdapterListener({ removeListener }, "connection-failed", cb);
    expect(removeListener).toHaveBeenCalledWith("connection-failed", cb);
  });

  it("is a no-op when neither method exists", () => {
    expect(() => removeAdapterListener({}, "x", jest.fn())).not.toThrow();
  });
});
