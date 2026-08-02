import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { KeyInitError } from "../../errors";

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockInitialize = jest.fn();
const mockCleanup = jest.fn();
const mockResetForMigration = jest.fn();
const mockSetOnMigrationComplete = jest.fn();
const mockSetResetRequestedCallback = jest.fn();
const mockConstructorSpy = jest.fn();

jest.mock("../../../main-container", () => ({
  MainContainer: jest.fn().mockImplementation(() => {
    mockConstructorSpy();
    return {
      initialize: mockInitialize,
      cleanup: mockCleanup,
      resetForMigration: mockResetForMigration,
    };
  }),
  setResetRequestedCallback: (cb: () => void) =>
    mockSetResetRequestedCallback(cb),
}));

const mockUserStore = {
  isGuest: false,
  hasUser: true,
};

// Stable identity, like the real context value — the provider rebuilds its
// container whenever the AuthContainer reference changes.
const mockAuthContainer = {
  userStore: mockUserStore,
  guestMigrationService: {
    setOnMigrationComplete: mockSetOnMigrationComplete,
  },
};

jest.mock("@/features/auth/hooks/use-auth-container", () => ({
  useAuthContainer: () => mockAuthContainer,
}));

jest.mock("../app-mode-context", () => ({
  useAppModeStore: () => ({}),
}));

jest.mock("@/features/shared/components/page-loader", () => {
  const { Text: RNText } = require("react-native");
  return { PageLoader: () => <RNText testID="loader">loading</RNText> };
});

// The global react-native-paper mock in jest-setup.js has no Button, and this
// provider's error state renders one.
jest.mock("react-native-paper", () => {
  const RN = require("react-native");
  const ReactModule = require("react");
  return {
    Text: ({ children, ...props }: Record<string, unknown>) =>
      ReactModule.createElement(RN.Text, props, children),
    Button: ({ children, onPress, ...props }: Record<string, unknown>) =>
      ReactModule.createElement(RN.Text, { onPress, ...props }, children),
  };
});

jest.mock("../../utils/logger", () => ({
  appLog: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderProvider() {
  const { MainContainerProvider } = require("../main-container-context");
  return render(
    <MainContainerProvider>
      <Text testID="child">ready</Text>
    </MainContainerProvider>
  );
}

/** A promise whose settlement this test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MainContainerProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserStore.isGuest = false;
    mockUserStore.hasUser = true;
    mockInitialize.mockResolvedValue(undefined);
    mockCleanup.mockResolvedValue(undefined);
  });

  it("renders children once the container initializes", async () => {
    // Act
    const { findByTestId } = renderProvider();

    // Assert
    expect(await findByTestId("child")).toBeTruthy();
  });

  it("shows the error screen with a distinguishable reason code on failure", async () => {
    // Arrange
    mockInitialize.mockRejectedValue(
      new KeyInitError("no master key", "MASTER_KEY_UNAVAILABLE")
    );

    // Act
    const { findByText } = renderProvider();

    // Assert
    expect(await findByText("Unable to load your account")).toBeTruthy();
    expect(await findByText(/MASTER_KEY_UNAVAILABLE/)).toBeTruthy();
  });

  it("recovers on Try Again without an app restart", async () => {
    // Arrange
    mockInitialize
      .mockRejectedValueOnce(new KeyInitError("transient", "KEY_SERVER_UNREACHABLE"))
      .mockResolvedValue(undefined);
    const { findByText, findByTestId } = renderProvider();
    const retry = await findByText("Try Again");

    // Act
    fireEvent.press(retry);

    // Assert
    expect(await findByTestId("child")).toBeTruthy();
  });

  it("tears down the failed container before rebuilding on Try Again", async () => {
    // Arrange
    mockInitialize
      .mockRejectedValueOnce(new KeyInitError("transient", "KEY_SERVER_UNREACHABLE"))
      .mockResolvedValue(undefined);
    const { findByText, findByTestId } = renderProvider();

    // Act
    fireEvent.press(await findByText("Try Again"));
    await findByTestId("child");

    // Assert: a retry that reuses stale in-memory state is what forces a
    // force-quit today, so the old container must be cleaned up first.
    expect(mockCleanup).toHaveBeenCalled();
    expect(mockConstructorSpy).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale initialization that rejects after a newer run succeeded", async () => {
    // Arrange: run #1 hangs, user retries, run #2 succeeds, then run #1 rejects
    const stale = deferred<void>();
    mockInitialize
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue(undefined);
    const { findByTestId, queryByText } = renderProvider();
    await findByTestId("loader");

    // Act: the relogin path asks the provider to rebuild while run #1 is in flight
    expect(mockSetResetRequestedCallback).toHaveBeenCalled();
    const triggerReset = mockSetResetRequestedCallback.mock.calls[0][0];
    triggerReset();
    await findByTestId("child");
    stale.reject(new KeyInitError("late failure", "KEY_SERVER_UNREACHABLE"));

    // Assert
    await waitFor(() => {
      expect(queryByText("Unable to load your account")).toBeNull();
    });
    expect(await findByTestId("child")).toBeTruthy();
  });

  it("reports AUTH_STATE_NOT_READY instead of a generic failure when auth has not settled", async () => {
    // Arrange
    mockUserStore.hasUser = false;

    // Act
    const { findByText } = renderProvider();

    // Assert
    expect(await findByText(/AUTH_STATE_NOT_READY/)).toBeTruthy();
    expect(mockConstructorSpy).not.toHaveBeenCalled();
  });
});
