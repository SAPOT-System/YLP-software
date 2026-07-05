import * as ExpoSecureStore from "expo-secure-store";
import {
  clearAccessToken,
  getStoredAccessToken,
  saveAccessToken,
} from "../secure-config";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockedSetItemAsync = ExpoSecureStore.setItemAsync as jest.Mock;
const mockedDeleteItemAsync = ExpoSecureStore.deleteItemAsync as jest.Mock;
const mockedGetItemAsync = ExpoSecureStore.getItemAsync as jest.Mock;

describe("secure-config access token", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("saveAccessToken", () => {
    it("writes the token under the access_token key", async () => {
      mockedSetItemAsync.mockResolvedValue(undefined);

      await saveAccessToken("fake-jwt");

      expect(mockedSetItemAsync).toHaveBeenCalledWith(
        "access_token",
        "fake-jwt"
      );
    });

    it("propagates errors from SecureStore", async () => {
      mockedSetItemAsync.mockRejectedValue(new Error("boom"));

      await expect(saveAccessToken("fake-jwt")).rejects.toThrow("boom");
    });
  });

  describe("clearAccessToken", () => {
    it("deletes the access_token key", async () => {
      mockedDeleteItemAsync.mockResolvedValue(undefined);

      await clearAccessToken();

      expect(mockedDeleteItemAsync).toHaveBeenCalledWith("access_token");
    });

    it("swallows errors from SecureStore", async () => {
      mockedDeleteItemAsync.mockRejectedValue(new Error("boom"));

      await expect(clearAccessToken()).resolves.toBeUndefined();
    });
  });

  describe("getStoredAccessToken", () => {
    it("reads back a saved token", async () => {
      mockedGetItemAsync.mockResolvedValue("fake-jwt");

      await expect(getStoredAccessToken()).resolves.toBe("fake-jwt");
    });
  });
});
