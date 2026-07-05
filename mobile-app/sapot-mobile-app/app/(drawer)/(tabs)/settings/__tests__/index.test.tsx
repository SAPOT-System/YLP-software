import { render } from "@testing-library/react-native";
import React from "react";
import Settings from "../index";

jest.mock("expo-router", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => {
    const { Pressable } = require("react-native");
    return (
      <Pressable accessibilityRole="link" accessibilityLabel={href}>
        {children}
      </Pressable>
    );
  },
}));

jest.mock("@/features/auth", () => ({
  GuestLogoutWarningModal: () => null,
  useAuth: () => ({
    isAuthenticated: true,
    logout: jest.fn(),
    logoutAsGuest: jest.fn(),
  }),
}));

jest.mock("@/features/shared/core/context", () => ({
  useThemePreference: () => ({ themeChoice: "system" }),
}));

jest.mock("@/features/shared/hooks", () => ({
  useProfilePhoto: () => ({ url: null }),
  useUserProfile: () => ({
    user: { username: "tester", email: undefined },
    isGuest: false,
  }),
}));

describe("Settings screen", () => {
  it("renders an About Us row linking to the About Us route", () => {
    const { getByText, getByLabelText } = render(<Settings />);

    expect(getByText("About Us")).toBeTruthy();
    expect(
      getByLabelText("/(drawer)/settings/support/about-us")
    ).toBeTruthy();
  });
});
