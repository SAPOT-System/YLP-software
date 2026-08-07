import { isVisible } from "../help-visibility";
import type { HelpContext } from "../../types";

const ctx = (overrides: Partial<HelpContext> = {}): HelpContext => ({
  mode: "server", isGuest: false, isRescuer: false, ...overrides,
});

describe("isVisible", () => {
  it("shows undeclared audiences", () => expect(isVisible(undefined, ctx())).toBe(true));
  it("requires all declared audience conditions", () => {
    const audience = { modes: ["server"] as const, rescuerOnly: true as const, guest: "exclude" as const };
    expect(isVisible(audience, ctx())).toBe(false);
    expect(isVisible(audience, ctx({ isRescuer: true }))).toBe(true);
    expect(isVisible(audience, ctx({ isRescuer: true, mode: "lan" }))).toBe(false);
    expect(isVisible(audience, ctx({ isRescuer: true, isGuest: true }))).toBe(false);
  });
});
