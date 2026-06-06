import { renderHook, act } from "@testing-library/react-native";
import { useChangePassword } from "../use-change-password";

jest.mock("../../api/auth.api", () => ({
  canResetPasswordApi: jest.fn().mockResolvedValue({ valid: true, userId: "user-1" }),
  resetPasswordApi: jest.fn().mockResolvedValue({ status: 200 }),
}));

import { resetPasswordApi, canResetPasswordApi } from "../../api/auth.api";

const mockReset = resetPasswordApi as jest.Mock;
const mockCan = canResetPasswordApi as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCan.mockResolvedValue({ valid: true, userId: "user-1" });
  mockReset.mockResolvedValue({ status: 200 });
});

describe("useChangePassword", () => {
  it("passes recoveryToken as 4th arg to resetPasswordApi", async () => {
    const { result } = renderHook(() => useChangePassword("reset-tok"));
    await act(async () => {
      await result.current.changePassword({
        password: "ValidPass1!",
        confirmPassword: "ValidPass1!",
        identifier: "u@test.com",
        wrappedBlob: "blob",
        recoveryToken: "rec-abc",
      });
    });
    expect(mockReset).toHaveBeenCalledWith("reset-tok", "ValidPass1!", "blob", "rec-abc");
  });

  it("passes undefined when recoveryToken not supplied", async () => {
    const { result } = renderHook(() => useChangePassword("reset-tok"));
    await act(async () => {
      await result.current.changePassword({
        password: "ValidPass1!",
        confirmPassword: "ValidPass1!",
        identifier: "u@test.com",
      });
    });
    expect(mockReset).toHaveBeenCalledWith("reset-tok", "ValidPass1!", undefined, undefined);
  });
});
