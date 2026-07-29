import {
  MAP_LEGEND_ROLES,
  resolveRoleMarker,
  RoleMarkerTheme,
} from "../resolve-role-marker";

const theme: RoleMarkerTheme = {
  colors: {
    primary: "#3A7AFE",
    error: "#FF0000",
  },
};

describe("resolveRoleMarker", () => {
  test("gives rescuers a shield icon distinct from the regular-user pin", () => {
    const rescuer = resolveRoleMarker("rescuer", theme);
    const user = resolveRoleMarker("user", theme);

    expect(rescuer.icon).not.toBe(user.icon);
    expect(rescuer.icon).toBe("shield-account");
    expect(user.icon).toBe("map-marker-account");
  });

  test("does not rely on colour alone — icon differs for every role pair", () => {
    const icons = MAP_LEGEND_ROLES.map((role) => resolveRoleMarker(role, theme).icon);

    expect(new Set(icons).size).toBe(icons.length);
  });

  test("draws responders and civilians in different theme colours", () => {
    // Arrange / Act
    const rescuer = resolveRoleMarker("rescuer", theme);
    const user = resolveRoleMarker("user", theme);

    // Assert
    expect(rescuer.color).toBe(theme.colors.error);
    expect(user.color).toBe(theme.colors.primary);
  });

  test("admins read as responders, sharing the responder colour", () => {
    const admin = resolveRoleMarker("admin", theme);

    expect(admin.color).toBe(theme.colors.error);
    expect(admin.icon).toBe("shield-star");
  });

  test("falls back to the regular-user marker for a missing or unknown role", () => {
    const fallback = resolveRoleMarker(undefined, theme);
    const unknown = resolveRoleMarker("moderator", theme);

    expect(fallback.icon).toBe("map-marker-account");
    expect(fallback.color).toBe(theme.colors.primary);
    expect(unknown.icon).toBe("map-marker-account");
  });

  test("every legend role carries a human-readable label", () => {
    for (const role of MAP_LEGEND_ROLES) {
      expect(resolveRoleMarker(role, theme).label.length).toBeGreaterThan(0);
    }
  });
});
