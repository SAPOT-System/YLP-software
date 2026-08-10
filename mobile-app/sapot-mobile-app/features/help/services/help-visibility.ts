import type { HelpAudience, HelpContext } from "../types";

/** The single audience predicate shared by articles, blocks, and tour steps. */
export function isVisible(audience: HelpAudience | undefined, ctx: HelpContext): boolean {
  if (!audience) return true;
  if (audience.modes && !audience.modes.includes(ctx.mode)) return false;
  if (audience.rescuerOnly && !ctx.isRescuer) return false;
  if (audience.guest === "only" && !ctx.isGuest) return false;
  if (audience.guest === "exclude" && ctx.isGuest) return false;
  return true;
}
