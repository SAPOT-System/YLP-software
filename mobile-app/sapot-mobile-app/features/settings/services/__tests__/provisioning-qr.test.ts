import { parseProvisioningQr } from "../provisioning-qr";

describe("parseProvisioningQr", () => {
  it("returns ip and caFp for a valid payload", () => {
    const result = parseProvisioningQr('{"ip":"192.168.1.55","caFp":"aa:bb:cc"}');

    expect(result).toEqual({ ip: "192.168.1.55", caFp: "aa:bb:cc" });
  });

  it("throws for invalid JSON", () => {
    expect(() => parseProvisioningQr("not json")).toThrow("invalid QR payload");
  });

  it("throws when ip is missing", () => {
    expect(() => parseProvisioningQr('{"caFp":"aa:bb:cc"}')).toThrow(
      "invalid QR payload"
    );
  });

  it("throws when caFp is missing", () => {
    expect(() => parseProvisioningQr('{"ip":"192.168.1.55"}')).toThrow(
      "invalid QR payload"
    );
  });

  it("throws when ip is not a string", () => {
    expect(() =>
      parseProvisioningQr('{"ip":123,"caFp":"aa:bb:cc"}')
    ).toThrow("invalid QR payload");
  });

  it("throws when caFp is not a string", () => {
    expect(() =>
      parseProvisioningQr('{"ip":"192.168.1.55","caFp":123}')
    ).toThrow("invalid QR payload");
  });

  it("throws for a JSON array instead of an object", () => {
    expect(() => parseProvisioningQr("[1,2,3]")).toThrow("invalid QR payload");
  });

  it("throws for null JSON", () => {
    expect(() => parseProvisioningQr("null")).toThrow("invalid QR payload");
  });
});
