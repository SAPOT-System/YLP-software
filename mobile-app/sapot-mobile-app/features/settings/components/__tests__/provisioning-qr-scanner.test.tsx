import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

const mockSetServerIp = jest.fn();
const mockCurrentFingerprint = jest.fn();

jest.mock("@/features/shared/hooks", () => ({
  useCertProvisioningService: () => ({
    setServerIp: mockSetServerIp,
    currentFingerprint: mockCurrentFingerprint,
  }),
}));

let mockPermissionResult = { status: "granted" };
jest.mock("expo-camera", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Camera: {
      requestCameraPermissionsAsync: () =>
        Promise.resolve(mockPermissionResult),
    },
    CameraView: React.forwardRef(
      (props: Record<string, unknown>, ref: unknown) =>
        React.createElement(View, { ...props, ref, testID: "camera-view" })
    ),
  };
});

jest.mock("react-native-paper", () => {
  const React = require("react");
  const { Text, Pressable } = require("react-native");
  return {
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(Text, props, children),
    Button: ({
      children,
      onPress,
      disabled,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
    }) =>
      React.createElement(
        Pressable,
        { onPress: disabled ? undefined : onPress },
        React.createElement(Text, null, children)
      ),
    useTheme: () => ({
      colors: {
        onSurface: "#000",
        errorContainer: "#f00",
        onErrorContainer: "#fff",
      },
    }),
  };
});

import { ProvisioningQrScanner } from "../provisioning-qr-scanner";

const VALID_QR = JSON.stringify({ ip: "192.168.1.55", caFp: "aa:bb:cc" });

describe("ProvisioningQrScanner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPermissionResult = { status: "granted" };
  });

  it("shows a requesting-permission state before the permission promise resolves", () => {
    const { getByText } = render(<ProvisioningQrScanner />);
    expect(getByText("Requesting camera permission...")).toBeTruthy();
  });

  it("shows a denied state distinct from granted/not-asked", async () => {
    mockPermissionResult = { status: "denied" };
    const { findByText, queryByTestId } = render(<ProvisioningQrScanner />);

    await findByText(/Camera access denied/);
    expect(queryByTestId("camera-view")).toBeNull();
  });

  it("renders the camera when permission is granted", async () => {
    const { findByTestId } = render(<ProvisioningQrScanner />);
    expect(await findByTestId("camera-view")).toBeTruthy();
  });

  it("sets the server IP and shows success on a matching fingerprint, requiring an explicit Done tap before dismissing", async () => {
    mockSetServerIp.mockResolvedValue(undefined);
    mockCurrentFingerprint.mockResolvedValue("aa:bb:cc");
    const onDone = jest.fn();

    const { findByTestId, findByText } = render(
      <ProvisioningQrScanner onDone={onDone} />
    );
    const camera = await findByTestId("camera-view");

    fireEvent(camera, "onBarcodeScanned", { data: VALID_QR, type: "qr" });

    await waitFor(() => expect(mockSetServerIp).toHaveBeenCalledWith("192.168.1.55"));
    await findByText(/Scanned fingerprint matches the active CA/);

    // The success confirmation must stay visible until the user explicitly
    // dismisses it — onDone must NOT fire automatically on a match, or the
    // caller (a modal) could close before the user reads the confirmation.
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.press(await findByText("Done"));
    expect(onDone).toHaveBeenCalled();
  });

  it("warns without silently ignoring a fingerprint mismatch", async () => {
    mockSetServerIp.mockResolvedValue(undefined);
    mockCurrentFingerprint.mockResolvedValue("zz:zz:zz");
    const onDone = jest.fn();

    const { findByTestId, findByText } = render(
      <ProvisioningQrScanner onDone={onDone} />
    );
    const camera = await findByTestId("camera-view");

    fireEvent(camera, "onBarcodeScanned", { data: VALID_QR, type: "qr" });

    await findByText(/Fingerprint mismatch/);
    // Advisory only: the IP was still applied, not blocked.
    expect(mockSetServerIp).toHaveBeenCalledWith("192.168.1.55");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("surfaces a no-active-anchor state instead of treating it as a silent match", async () => {
    mockSetServerIp.mockResolvedValue(undefined);
    mockCurrentFingerprint.mockResolvedValue(null);

    const { findByTestId, findByText } = render(<ProvisioningQrScanner />);
    const camera = await findByTestId("camera-view");

    fireEvent(camera, "onBarcodeScanned", { data: VALID_QR, type: "qr" });

    await findByText(/No CA is currently active/);
  });

  it("shows an error and allows re-scanning on malformed QR payloads", async () => {
    const { findByTestId, findByText, getByText } = render(
      <ProvisioningQrScanner />
    );
    const camera = await findByTestId("camera-view");

    fireEvent(camera, "onBarcodeScanned", { data: "not json", type: "qr" });

    await findByText(/not a valid provisioning payload/);
    expect(mockSetServerIp).not.toHaveBeenCalled();

    const scanAgain = getByText("Scan Again");
    expect(scanAgain).toBeTruthy();
  });

  it("does not fire setServerIp twice for rapid repeated scans of one QR", async () => {
    mockSetServerIp.mockResolvedValue(undefined);
    mockCurrentFingerprint.mockResolvedValue("aa:bb:cc");

    const { findByTestId } = render(<ProvisioningQrScanner />);
    const camera = await findByTestId("camera-view");

    fireEvent(camera, "onBarcodeScanned", { data: VALID_QR, type: "qr" });
    fireEvent(camera, "onBarcodeScanned", { data: VALID_QR, type: "qr" });
    fireEvent(camera, "onBarcodeScanned", { data: VALID_QR, type: "qr" });

    await waitFor(() => expect(mockSetServerIp).toHaveBeenCalledTimes(1));
  });
});
