import { AppError } from "../app-error";

describe("AppError", () => {
  it("extends Error so instanceof Error is true", () => {
    const err = new AppError("something failed", "network", "medium");
    expect(err).toBeInstanceOf(Error);
  });

  it("stores domain, severity, and message", () => {
    const err = new AppError("oops", "auth", "high");
    expect(err.message).toBe("oops");
    expect(err.domain).toBe("auth");
    expect(err.severity).toBe("high");
  });

  it("preserves cause when provided", () => {
    const original = new Error("original");
    const err = new AppError("wrapped", "database", "low", original);
    expect(err.cause).toBe(original);
  });

  it("cause is undefined when not provided", () => {
    const err = new AppError("no cause", "unknown", "low");
    expect(err.cause).toBeUndefined();
  });

  it("name is AppError", () => {
    const err = new AppError("x", "crypto", "critical");
    expect(err.name).toBe("AppError");
  });
});
