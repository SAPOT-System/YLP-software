import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { faultInjector } from "@/features/debug/services/fault-injector";
import { HealthProvider, useServerStatus } from "../health-context";

jest.mock("@/config/debug", () => ({ IS_DEBUG_ENABLED: true }));

jest.mock("../app-mode-context", () => ({
  useAppMode: () => ({ store: { getEffectiveMode: () => "auto" } }),
}));

jest.mock("@/features/auth/hooks/use-auth-container", () => ({
  useAuthContainer: () => ({ userStore: { isGuest: false } }),
}));

jest.mock("../../api/connection.api", () => ({
  checkBackEndHealth: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../../hooks/use-ping", () => ({
  usePing: () => ({ online: true, latency: 42 }),
}));

function StatusProbe() {
  const { online } = useServerStatus();
  return <Text>{online ? "online" : "offline"}</Text>;
}

describe("HealthProvider — debug fault injection", () => {
  afterEach(() => {
    faultInjector.setOfflineFlag("noInternet", false);
    faultInjector.setOfflineFlag("serverDown", false);
  });

  it("reports online normally when no fault is forced", async () => {
    const { getByText } = render(
      <HealthProvider>
        <StatusProbe />
      </HealthProvider>
    );

    await waitFor(() => expect(getByText("online")).toBeTruthy());
  });

  it("reports offline when the noInternet fault is set", async () => {
    faultInjector.setOfflineFlag("noInternet", true);

    const { getByText } = render(
      <HealthProvider>
        <StatusProbe />
      </HealthProvider>
    );

    await waitFor(() => expect(getByText("offline")).toBeTruthy());
  });

  it("reports offline when the serverDown fault is set", async () => {
    faultInjector.setOfflineFlag("serverDown", true);

    const { getByText } = render(
      <HealthProvider>
        <StatusProbe />
      </HealthProvider>
    );

    await waitFor(() => expect(getByText("offline")).toBeTruthy());
  });
});
