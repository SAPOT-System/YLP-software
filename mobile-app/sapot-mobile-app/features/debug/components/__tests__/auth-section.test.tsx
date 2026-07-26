import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";
import { useToast } from "@/features/shared/hooks";
import { AuthSection } from "../auth-section";
import { useDebugAuth } from "../../hooks/use-debug-auth";

jest.mock("../../hooks/use-debug-auth");

jest.mock("@/features/shared/hooks", () => ({
  useToast: jest.fn(),
}));

jest.mock("@/features/shared/components/app-snackbar", () => ({
  AppSnackbar: ({
    visible,
    children,
  }: {
    visible: boolean;
    children: React.ReactNode;
  }) => (visible ? children : null),
}));

jest.mock("react-native-paper", () => {
  const { Pressable, Text: RNText } = require("react-native");

  return {
    Button: ({
      children,
      onPress,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
    }) => (
      <Pressable onPress={onPress}>
        <RNText>{children}</RNText>
      </Pressable>
    ),
    IconButton: ({
      icon,
      onPress,
    }: {
      icon: string;
      onPress: () => void;
    }) => (
      <Pressable testID={icon === "arrow-left" ? "back-button" : `icon-${icon}`} onPress={onPress}>
        <RNText>{icon}</RNText>
      </Pressable>
    ),
    Divider: () => null,
    Text: RNText,
    useTheme: () => ({ colors: { onSurfaceVariant: "#888" } }),
  };
});

const mockedUseDebugAuth = useDebugAuth as jest.Mock;
const mockedUseToast = useToast as jest.Mock;

const baseHookValue = {
  snapshot: {
    userId: "peer-1",
    username: "alice",
    isGuest: false,
    isRescuer: false,
    isAdmin: false,
    hasAccessToken: false,
  },
  loading: false,
  seedTestUser: jest.fn().mockResolvedValue(undefined),
  loginAs: jest.fn().mockResolvedValue(undefined),
  seedLanUser: jest.fn().mockResolvedValue(undefined),
  setRole: jest.fn().mockResolvedValue(undefined),
  injectFakeAccessToken: jest.fn().mockResolvedValue(undefined),
  clearAccessToken: jest.fn().mockResolvedValue(undefined),
  forceLogout: jest.fn().mockResolvedValue(undefined),
  resetAuthState: jest.fn().mockResolvedValue(undefined),
};

const baseToastValue = {
  visible: false,
  message: "",
  variant: "neutral" as const,
  showToast: jest.fn(),
  showError: jest.fn(),
  hideToast: jest.fn(),
};

function confirmAlert() {
  return jest
    .spyOn(Alert, "alert")
    .mockImplementation((_title, _message, buttons) => {
      const confirmButton = buttons?.find((button) => button.style === "destructive");
      confirmButton?.onPress?.();
    });
}

function cancelAlert() {
  return jest
    .spyOn(Alert, "alert")
    .mockImplementation((_title, _message, buttons) => {
      const cancelButton = buttons?.find((button) => button.style === "cancel");
      cancelButton?.onPress?.();
    });
}

describe("AuthSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseDebugAuth.mockReturnValue({ ...baseHookValue });
    mockedUseToast.mockReturnValue({ ...baseToastValue });
  });

  it("shows the current user snapshot", () => {
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    expect(getByText(/alice/)).toBeTruthy();
    expect(getByText(/peer-1/)).toBeTruthy();
  });

  it("shows no token stored when hasAccessToken is false", () => {
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    expect(getByText(/No token stored/)).toBeTruthy();
  });

  it("shows token present when hasAccessToken is true", () => {
    mockedUseDebugAuth.mockReturnValue({
      ...baseHookValue,
      snapshot: { ...baseHookValue.snapshot, hasAccessToken: true },
    });

    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    expect(getByText(/Token present/)).toBeTruthy();
  });

  it("seeds an auth user (the renamed default seed button)", async () => {
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Seed auth user"));

    await waitFor(() =>
      expect(baseHookValue.seedTestUser).toHaveBeenCalledWith("user")
    );
  });

  it("seeds a rescuer test user and confirms with a toast", async () => {
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Seed rescuer"));

    await waitFor(() =>
      expect(baseHookValue.seedTestUser).toHaveBeenCalledWith("rescuer")
    );
    await waitFor(() => expect(baseToastValue.showToast).toHaveBeenCalled());
  });

  it("logs in as a fixture handle and confirms with a toast", async () => {
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("qa_rescuer"));

    await waitFor(() =>
      expect(baseHookValue.loginAs).toHaveBeenCalledWith("qa_rescuer")
    );
    await waitFor(() => expect(baseToastValue.showToast).toHaveBeenCalled());
  });

  it("shows an error toast when logging in as a fixture fails", async () => {
    baseHookValue.loginAs.mockRejectedValueOnce(new Error("boom"));
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("qa_admin"));

    await waitFor(() => expect(baseToastValue.showError).toHaveBeenCalled());
  });

  it("seeds a LAN (guest) user and confirms with a toast", async () => {
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Seed LAN user"));

    await waitFor(() => expect(baseHookValue.seedLanUser).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(baseToastValue.showToast).toHaveBeenCalled());
  });

  it("shows an error toast when seeding a LAN user fails", async () => {
    baseHookValue.seedLanUser.mockRejectedValueOnce(new Error("boom"));
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Seed LAN user"));

    await waitFor(() => expect(baseToastValue.showError).toHaveBeenCalled());
  });

  it("seeds an admin test user", async () => {
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Seed admin"));

    await waitFor(() =>
      expect(baseHookValue.seedTestUser).toHaveBeenCalledWith("admin")
    );
  });

  it("shows an error toast when seeding fails", async () => {
    baseHookValue.seedTestUser.mockRejectedValueOnce(new Error("boom"));
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Seed rescuer"));

    await waitFor(() => expect(baseToastValue.showError).toHaveBeenCalled());
  });

  it("switches the current user's role and confirms with a toast", async () => {
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Make rescuer"));

    await waitFor(() =>
      expect(baseHookValue.setRole).toHaveBeenCalledWith("rescuer")
    );
    await waitFor(() => expect(baseToastValue.showToast).toHaveBeenCalled());
  });

  it("injects a fake access token and confirms with a toast", async () => {
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Inject fake JWT"));

    await waitFor(() =>
      expect(baseHookValue.injectFakeAccessToken).toHaveBeenCalled()
    );
    await waitFor(() => expect(baseToastValue.showToast).toHaveBeenCalled());
  });

  it("clears the access token and confirms with a toast", async () => {
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Clear JWT"));

    await waitFor(() =>
      expect(baseHookValue.clearAccessToken).toHaveBeenCalled()
    );
    await waitFor(() => expect(baseToastValue.showToast).toHaveBeenCalled());
  });

  it("asks for confirmation before forcing logout, then confirms with a toast", async () => {
    const alertSpy = confirmAlert();
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Force logout"));

    expect(alertSpy).toHaveBeenCalled();
    await waitFor(() => expect(baseHookValue.forceLogout).toHaveBeenCalled());
    await waitFor(() => expect(baseToastValue.showToast).toHaveBeenCalled());
    alertSpy.mockRestore();
  });

  it("does not force logout when the confirmation is cancelled", () => {
    const alertSpy = cancelAlert();
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Force logout"));

    expect(baseHookValue.forceLogout).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("asks for confirmation before resetting auth state, then confirms with a toast", async () => {
    const alertSpy = confirmAlert();
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Reset auth state"));

    expect(alertSpy).toHaveBeenCalled();
    await waitFor(() => expect(baseHookValue.resetAuthState).toHaveBeenCalled());
    await waitFor(() => expect(baseToastValue.showToast).toHaveBeenCalled());
    alertSpy.mockRestore();
  });

  it("does not reset auth state when the confirmation is cancelled", () => {
    const alertSpy = cancelAlert();
    const { getByText } = render(<AuthSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Reset auth state"));

    expect(baseHookValue.resetAuthState).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("calls onBack when the back button is pressed", () => {
    const onBack = jest.fn();
    const { getByTestId } = render(<AuthSection onBack={onBack} />);

    fireEvent.press(getByTestId("back-button"));

    expect(onBack).toHaveBeenCalled();
  });
});
