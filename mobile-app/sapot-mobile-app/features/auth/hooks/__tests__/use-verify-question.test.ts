import { renderHook, act } from "@testing-library/react-native";
import { useVerifyAnswer } from "../use-verify-question";

jest.mock("../../api/auth.api", () => ({
  fetchChallengeApi: jest.fn(),
  verifySecurityQuestionApi: jest.fn(),
}));

jest.mock("../use-lockout-timer", () => ({
  useLockoutTimer: () => ({
    isLocked: false,
    secondsRemaining: 0,
    deviceType: null,
    attemptsRemaining: null,
    setLock: jest.fn(),
    clearLock: jest.fn(),
  }),
}));

import { verifySecurityQuestionApi } from "../../api/auth.api";

const mockVerify = verifySecurityQuestionApi as jest.Mock;

describe("useVerifyAnswer", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sets attemptsRemaining when answer is wrong", async () => {
    mockVerify.mockResolvedValueOnce({
      data: { correct: false, attempts_remaining: 3 },
      status: 200,
    });

    const { result } = renderHook(() => useVerifyAnswer("user123"));

    await act(async () => {
      await result.current.verifyAnswer({ question: "Q", answer: "wrong" });
    });

    expect(result.current.attemptsRemaining).toBe(3);
  });

  it("clears attemptsRemaining on correct answer", async () => {
    mockVerify.mockResolvedValueOnce({
      data: { correct: false, attempts_remaining: 2 },
      status: 200,
    });
    const { result } = renderHook(() => useVerifyAnswer("user123"));
    await act(async () => {
      await result.current.verifyAnswer({ question: "Q", answer: "wrong" });
    });

    mockVerify.mockResolvedValueOnce({
      data: { correct: true, reset_link: "http://x/?token=abc", recovery_token: "tok" },
      status: 200,
    });
    await act(async () => {
      await result.current.verifyAnswer({ question: "Q", answer: "fluffy" });
    });

    expect(result.current.attemptsRemaining).toBeNull();
  });
});
