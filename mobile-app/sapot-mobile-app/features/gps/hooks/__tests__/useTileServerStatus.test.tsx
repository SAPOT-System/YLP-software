import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import React from "react";
import { useTileServerStatus } from "../useTileServerStatus";

jest.mock("../../api/tileserver.api", () => ({
  checkTileServerReachable: jest.fn(),
}));

import { checkTileServerReachable } from "../../api/tileserver.api";

const mockProbe = checkTileServerReachable as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useTileServerStatus", () => {
  it("reports the tileserver as unavailable when the probe fails", async () => {
    // Arrange
    mockProbe.mockResolvedValue(false);

    // Act
    const { result } = renderHook(() => useTileServerStatus(), { wrapper });

    // Assert
    await waitFor(() => expect(result.current.isUnavailable).toBe(true));
  });

  it("does not report unavailable when the tileserver answers", async () => {
    mockProbe.mockResolvedValue(true);

    const { result } = renderHook(() => useTileServerStatus(), { wrapper });

    await waitFor(() => expect(mockProbe).toHaveBeenCalled());
    expect(result.current.isUnavailable).toBe(false);
  });

  it("does not report unavailable before the first probe resolves", () => {
    mockProbe.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useTileServerStatus(), { wrapper });

    expect(result.current.isUnavailable).toBe(false);
  });

  it("exposes a recheck that re-probes the tileserver", async () => {
    mockProbe.mockResolvedValue(false);

    const { result } = renderHook(() => useTileServerStatus(), { wrapper });
    await waitFor(() => expect(result.current.isUnavailable).toBe(true));

    mockProbe.mockResolvedValue(true);
    result.current.recheck();

    await waitFor(() => expect(result.current.isUnavailable).toBe(false));
  });
});
