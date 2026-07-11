import { render } from "@testing-library/react-native";
import React from "react";

jest.mock("@/config/debug", () => ({
  IS_DEBUG_ENABLED: false,
}));

jest.mock("@/features/shared/hooks", () => ({
  useCertProvisioningService: jest.fn(),
  useToast: jest.fn(),
}));

import ServerProvisioningScreen from "../server-provisioning";

describe("ServerProvisioningScreen (disabled)", () => {
  it("renders nothing when IS_DEBUG_ENABLED is false", () => {
    const { toJSON } = render(<ServerProvisioningScreen />);
    expect(toJSON()).toBeNull();
  });
});
