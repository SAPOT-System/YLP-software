import { isValidVersion, bumpPackageJson, syncAppConfig } from "../version-sync.js";

describe("isValidVersion", () => {
  test("accepts plain semver", () => {
    expect(isValidVersion("1.2.0")).toBe(true);
  });
  test("accepts pre-release suffixes", () => {
    expect(isValidVersion("1.2.0-beta.3")).toBe(true);
    expect(isValidVersion("1.2.0-rc.1")).toBe(true);
  });
  test("rejects junk and v-prefix", () => {
    expect(isValidVersion("v1.2.0")).toBe(false);
    expect(isValidVersion("1.2")).toBe(false);
    expect(isValidVersion("1.2.0-foo")).toBe(false);
  });
});

describe("bumpPackageJson", () => {
  test("returns a new object with version set, original unchanged", () => {
    const original = { name: "x", version: "0.2.0" };
    const next = bumpPackageJson(original, "1.2.0");
    expect(next.version).toBe("1.2.0");
    expect(original.version).toBe("0.2.0");
  });
});

describe("syncAppConfig", () => {
  const SRC = `export default ({ config }) => ({
  version: "0.9.1",
  runtimeVersion: "preview",
  extra: {
    displayVersion: "0.9.1",
  },
});`;
  test("updates version and displayVersion only", () => {
    const out = syncAppConfig(SRC, "1.2.0");
    expect(out).toContain(`version: "1.2.0"`);
    expect(out).toContain(`displayVersion: "1.2.0"`);
    expect(out).toContain(`runtimeVersion: "preview"`); // untouched
  });
});
