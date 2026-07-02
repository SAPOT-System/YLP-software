/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from "axios";
import { AppError } from "../app-error";
import { toAppError } from "../to-app-error";

describe("toAppError", () => {
  it("passes AppError instances through unchanged", () => {
    const original = new AppError("already typed", "auth", "high");
    expect(toAppError(original)).toBe(original);
  });

  it("maps Axios 401 to high severity", () => {
    const axiosErr = new axios.AxiosError("Unauthorized");
    axiosErr.response = { status: 401 } as any;
    const appErr = toAppError(axiosErr, "auth");
    expect(appErr.severity).toBe("high");
    expect(appErr.domain).toBe("auth");
    expect(appErr.cause).toBe(axiosErr);
  });

  it("maps Axios non-401 to medium severity", () => {
    const axiosErr = new axios.AxiosError("Server error");
    axiosErr.response = { status: 500 } as any;
    const appErr = toAppError(axiosErr, "network");
    expect(appErr.severity).toBe("medium");
    expect(appErr.domain).toBe("network");
  });

  it("defaults Axios error domain to 'network' when no domain provided", () => {
    const axiosErr = new axios.AxiosError("Network fail");
    const appErr = toAppError(axiosErr);
    expect(appErr.domain).toBe("network");
  });

  it("maps native Error to medium severity with unknown domain by default", () => {
    const err = new Error("native error");
    const appErr = toAppError(err);
    expect(appErr.domain).toBe("unknown");
    expect(appErr.severity).toBe("medium");
    expect(appErr.message).toBe("native error");
    expect(appErr.cause).toBe(err);
  });

  it("uses provided domain override for native Error", () => {
    const err = new Error("db write failed");
    const appErr = toAppError(err, "database");
    expect(appErr.domain).toBe("database");
  });

  it("maps string to low severity with unknown domain", () => {
    const appErr = toAppError("something went wrong");
    expect(appErr.domain).toBe("unknown");
    expect(appErr.severity).toBe("low");
    expect(appErr.message).toBe("something went wrong");
  });

  it("maps non-Error object to low severity", () => {
    const appErr = toAppError({ code: 42 });
    expect(appErr.severity).toBe("low");
    expect(appErr.message).toBe("[object Object]");
  });
});
