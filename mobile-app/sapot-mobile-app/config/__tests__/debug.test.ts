const originalDebugMenu = process.env.EXPO_PUBLIC_DEBUG_MENU;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originalDev = (globalThis as any).__DEV__;

afterEach(() => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_DEBUG_MENU = originalDebugMenu;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__DEV__ = originalDev;
});

describe("IS_DEBUG_ENABLED", () => {
  it("is true in development builds regardless of the env flag", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = true;
    delete process.env.EXPO_PUBLIC_DEBUG_MENU;

    const { IS_DEBUG_ENABLED } = require("../debug");

    expect(IS_DEBUG_ENABLED).toBe(true);
  });

  it("is true in non-dev builds when the QA opt-in env flag is set to 1", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = false;
    process.env.EXPO_PUBLIC_DEBUG_MENU = "1";

    const { IS_DEBUG_ENABLED } = require("../debug");

    expect(IS_DEBUG_ENABLED).toBe(true);
  });

  it("is false in production builds when the env flag is unset", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_DEBUG_MENU;

    const { IS_DEBUG_ENABLED } = require("../debug");

    expect(IS_DEBUG_ENABLED).toBe(false);
  });

  it("is false when the env flag is set to any value other than '1'", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = false;
    process.env.EXPO_PUBLIC_DEBUG_MENU = "true";

    const { IS_DEBUG_ENABLED } = require("../debug");

    expect(IS_DEBUG_ENABLED).toBe(false);
  });
});
