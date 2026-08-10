/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks */
import { render } from "@testing-library/react-native";
import React from "react";
import { BackHandler } from "react-native";

const mockMinimize = jest.fn();
const mockHandleClose = jest.fn();

const baseCallContext: any = {
  callState: "connected",
  elapsed: 0,
  peerDisplayName: "Peer",
  peerPhotoUrl: null,
  localStream: null,
  remoteStreamUrl: null,
  localMic: true,
  localCam: true,
  remoteMic: true,
  remoteCam: true,
  currentRoute: "earpiece",
  isFrontCamera: true,
  remoteStreamVersion: 0,
  resetCallState: jest.fn(),
  handleEndCall: jest.fn(),
  handleCallAgain: jest.fn(),
  handleToggleMic: jest.fn(),
  handleToggleCam: jest.fn(),
  handleSwitchCamera: jest.fn(),
  handleVolume: jest.fn(),
  minimize: mockMinimize,
  handleClose: mockHandleClose,
};

let mockCallContext = baseCallContext;

jest.mock("@/features/call/context/call-context", () => ({
  useCallContext: () => mockCallContext,
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "peer-1", type: "video", status: "connected" }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mock passes through the real callback identity
    React.useEffect(() => callback(), []);
  },
}));

// `react-native-webrtc` is a native module without a Jest mock in jest-setup.js
jest.mock("react-native-webrtc", () => ({ RTCView: () => null }));

describe("CallRoom hardware back handling", () => {
  let backPressHandler: (() => boolean) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCallContext = baseCallContext;
    backPressHandler = undefined;
    jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, handler) => {
      backPressHandler = handler as () => boolean;
      return { remove: jest.fn() };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("registers a hardware back handler", () => {
    const CallRoom = require("../[id]").default;
    render(<CallRoom />);
    expect(BackHandler.addEventListener).toHaveBeenCalledWith(
      "hardwareBackPress",
      expect.any(Function),
    );
  });

  test("routes hardware back to minimize while the call is connected, without navigating away", () => {
    const CallRoom = require("../[id]").default;
    render(<CallRoom />);

    const handled = backPressHandler?.();

    expect(mockMinimize).toHaveBeenCalledTimes(1);
    expect(mockHandleClose).not.toHaveBeenCalled();
    expect(handled).toBe(true);
  });

  test("routes hardware back to minimize while reconnecting", () => {
    mockCallContext = { ...baseCallContext, callState: "reconnecting" };
    const CallRoom = require("../[id]").default;
    render(<CallRoom />);

    const handled = backPressHandler?.();

    expect(mockMinimize).toHaveBeenCalledTimes(1);
    expect(handled).toBe(true);
  });

  test("does not intercept hardware back once the call has ended (default pop applies)", () => {
    mockCallContext = { ...baseCallContext, callState: "ended" };
    const CallRoom = require("../[id]").default;
    render(<CallRoom />);

    const handled = backPressHandler?.();

    expect(mockMinimize).not.toHaveBeenCalled();
    expect(handled).toBe(false);
  });
});
