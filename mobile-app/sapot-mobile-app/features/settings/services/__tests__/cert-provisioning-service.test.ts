import { CertProvisioningService } from "../cert-provisioning-service";
import { saveServerHostOverride } from "@/features/shared/core/stores/secure-config";

jest.mock("@/features/shared/core/stores/secure-config", () => ({
  saveServerHostOverride: jest.fn(),
}));

const VALID_PEM = [
  "-----BEGIN CERTIFICATE-----",
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...fake...",
  "-----END CERTIFICATE-----",
].join("\n");

describe("CertProvisioningService", () => {
  let trust: {
    setCaPem: jest.Mock;
    getActiveFingerprint: jest.Mock;
    setServerAddress: jest.Mock;
    clearCaPem: jest.Mock;
    getServerAddress: jest.Mock;
    isReleaseBuild: jest.Mock;
  };
  let service: CertProvisioningService;

  beforeEach(() => {
    jest.clearAllMocks();
    trust = {
      setCaPem: jest.fn().mockResolvedValue(undefined),
      getActiveFingerprint: jest.fn().mockResolvedValue("aa:bb:cc"),
      setServerAddress: jest.fn().mockResolvedValue(undefined),
      clearCaPem: jest.fn().mockResolvedValue(undefined),
      getServerAddress: jest.fn().mockResolvedValue(null),
      isReleaseBuild: jest.fn().mockReturnValue(false),
    };
    service = new CertProvisioningService({ trust: trust as never });
  });

  describe("importCaPem", () => {
    it("rejects a non-PEM string", async () => {
      await expect(service.importCaPem("not a certificate")).rejects.toThrow(
        "invalid certificate"
      );
      expect(trust.setCaPem).not.toHaveBeenCalled();
    });

    it("stores a valid PEM and returns the active fingerprint", async () => {
      const result = await service.importCaPem(VALID_PEM);

      expect(trust.setCaPem).toHaveBeenCalledWith(VALID_PEM);
      expect(trust.getActiveFingerprint).toHaveBeenCalled();
      expect(result).toEqual({ fingerprint: "aa:bb:cc" });
    });
  });

  describe("setServerIp", () => {
    it("rejects an invalid IPv4 address", async () => {
      await expect(service.setServerIp("999.1.1.1")).rejects.toThrow();
      expect(trust.setServerAddress).not.toHaveBeenCalled();
      expect(saveServerHostOverride).not.toHaveBeenCalled();
    });

    it("pins the server address and persists the override for a valid IPv4", async () => {
      await service.setServerIp("192.168.1.55");

      expect(trust.setServerAddress).toHaveBeenCalledWith(
        "server.sapot.lan",
        "192.168.1.55"
      );
      expect(saveServerHostOverride).toHaveBeenCalledWith("192.168.1.55");
    });
  });

  describe("currentFingerprint", () => {
    it("delegates to trust.getActiveFingerprint", async () => {
      trust.getActiveFingerprint.mockResolvedValueOnce("dd:ee:ff");

      const fingerprint = await service.currentFingerprint();

      expect(trust.getActiveFingerprint).toHaveBeenCalled();
      expect(fingerprint).toBe("dd:ee:ff");
    });

    it("returns null when no trust anchor is active", async () => {
      trust.getActiveFingerprint.mockResolvedValueOnce(null);

      const fingerprint = await service.currentFingerprint();

      expect(fingerprint).toBeNull();
    });
  });

  describe("reset", () => {
    it("clears the runtime CA via trust.clearCaPem", async () => {
      await service.reset();

      expect(trust.clearCaPem).toHaveBeenCalled();
    });
  });
});
