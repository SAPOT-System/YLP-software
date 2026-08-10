/**
 * Map-marker styling per user role.
 *
 * Role vocabulary (`admin` | `rescuer` | `user`) matches the server's
 * `_resolve_role` and the chat role badge — don't introduce a second one.
 *
 * The distinction is carried twice, deliberately: colour separates responders
 * from civilians, and the icon shape repeats that split. Colour alone would
 * disappear in greyscale screenshots and for colour-blind operators.
 */

/** Minimal slice of the Paper theme this resolver needs; MD3Theme satisfies it. */
export type RoleMarkerTheme = {
  colors: {
    primary: string;
    error: string;
  };
};

export type RoleMarker = {
  icon: string;
  color: string;
  label: string;
};

/** Roles the map legend explains, in display order. */
export const MAP_LEGEND_ROLES = ["rescuer", "admin", "user"] as const;

export type MapLegendRole = (typeof MAP_LEGEND_ROLES)[number];

type RoleMarkerSpec = {
  icon: string;
  label: string;
  tone: keyof RoleMarkerTheme["colors"];
};

const REGULAR_USER_SPEC: RoleMarkerSpec = {
  icon: "map-marker-account",
  label: "Resident",
  tone: "primary",
};

const ROLE_MARKER_SPECS: Record<MapLegendRole, RoleMarkerSpec> = {
  rescuer: { icon: "shield-account", label: "Rescuer", tone: "error" },
  admin: { icon: "shield-star", label: "Admin", tone: "error" },
  user: REGULAR_USER_SPEC,
};

/**
 * Resolve the marker icon/colour/label for a role. Unknown or missing roles
 * fall back to the regular-user marker rather than vanishing from the map.
 */
export function resolveRoleMarker(
  role: string | undefined | null,
  theme: RoleMarkerTheme
): RoleMarker {
  const spec =
    (role && ROLE_MARKER_SPECS[role as MapLegendRole]) || REGULAR_USER_SPEC;

  return {
    icon: spec.icon,
    color: theme.colors[spec.tone],
    label: spec.label,
  };
}
