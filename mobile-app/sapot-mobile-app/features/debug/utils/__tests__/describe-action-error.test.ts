import axios from "axios";
import { describeActionError } from "../describe-action-error";

function axiosErrorWith(status: number, data: unknown) {
  const error = new axios.AxiosError(`Request failed with status code ${status}`);
  error.response = {
    status,
    data,
    statusText: "",
    headers: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub, only status/data are read
    config: {} as any,
  };
  return error;
}

describe("describeActionError", () => {
  it("surfaces the FastAPI detail string alongside the status", () => {
    // Arrange — what /testing/login-as returns once the QA token is accepted
    // but the fixture row was never seeded.
    const error = axiosErrorWith(404, { detail: "User not found" });

    // Act
    const reason = describeActionError(error);

    // Assert
    expect(reason).toBe("HTTP 404 — User not found");
  });

  it("distinguishes the QA-token guard from an unseeded fixture", () => {
    // Arrange — require_qa_token 404s with FastAPI's stock body when the
    // X-QA-Token header is missing or wrong.
    const guardError = axiosErrorWith(404, { detail: "Not Found" });
    const unseededError = axiosErrorWith(404, { detail: "User not found" });

    // Act / Assert — identical status, different reason
    expect(describeActionError(guardError)).not.toBe(
      describeActionError(unseededError)
    );
  });

  it("reports an unreachable server when there is no response", () => {
    // Arrange
    const error = new axios.AxiosError("Network Error");

    // Act
    const reason = describeActionError(error);

    // Assert
    expect(reason).toBe("server unreachable");
  });

  it("falls back to the status alone when the body has no detail", () => {
    // Arrange
    const error = axiosErrorWith(500, "<html>oops</html>");

    // Act
    const reason = describeActionError(error);

    // Assert
    expect(reason).toBe("HTTP 500");
  });

  it("joins FastAPI validation detail arrays", () => {
    // Arrange
    const error = axiosErrorWith(422, {
      detail: [{ msg: "field required" }, { msg: "value is not a valid uuid" }],
    });

    // Act
    const reason = describeActionError(error);

    // Assert
    expect(reason).toBe("HTTP 422 — field required, value is not a valid uuid");
  });

  it("uses the message of a plain Error", () => {
    // Arrange
    const error = new Error("database wipe failed");

    // Act
    const reason = describeActionError(error);

    // Assert
    expect(reason).toBe("database wipe failed");
  });

  it("stringifies a non-Error throw", () => {
    // Arrange / Act
    const reason = describeActionError("boom");

    // Assert
    expect(reason).toBe("boom");
  });
});
