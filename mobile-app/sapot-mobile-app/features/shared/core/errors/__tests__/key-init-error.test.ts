import { AppError } from "../app-error";
import { KeyInitError, toKeyInitError } from "../key-init-error";

describe("KeyInitError", () => {
  it("is an AppError in the crypto domain", () => {
    // Arrange / Act
    const error = new KeyInitError("boom", "MASTER_KEY_UNAVAILABLE");

    // Assert
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(KeyInitError);
    expect(error.domain).toBe("crypto");
    expect(error.name).toBe("KeyInitError");
  });

  it("exposes the code and optional detail", () => {
    // Arrange
    const cause = new Error("underlying");

    // Act
    const error = new KeyInitError("boom", "SECURE_STORE_READ_FAILED", {
      cause,
      detail: "cache-partial",
    });

    // Assert
    expect(error.code).toBe("SECURE_STORE_READ_FAILED");
    expect(error.detail).toBe("cache-partial");
    expect(error.cause).toBe(cause);
  });
});

describe("toKeyInitError", () => {
  it("returns the same instance when already a KeyInitError", () => {
    // Arrange
    const original = new KeyInitError("boom", "KEY_SERVER_UNREACHABLE");

    // Act
    const result = toKeyInitError(original, "UNKNOWN");

    // Assert
    expect(result).toBe(original);
  });

  it("wraps an unknown error with the supplied fallback code", () => {
    // Arrange
    const cause = new Error("network down");

    // Act
    const result = toKeyInitError(cause, "PEER_KEY_INIT_FAILED");

    // Assert
    expect(result).toBeInstanceOf(KeyInitError);
    expect(result.code).toBe("PEER_KEY_INIT_FAILED");
    expect(result.message).toBe("network down");
    expect(result.cause).toBe(cause);
  });

  it("defaults to UNKNOWN when no fallback code is supplied", () => {
    // Act
    const result = toKeyInitError("something odd");

    // Assert
    expect(result.code).toBe("UNKNOWN");
    expect(result.message).toBe("something odd");
  });
});
