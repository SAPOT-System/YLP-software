/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

const mockSetIncomingCall = jest.fn();
const mockClearIncomingCall = jest.fn();
const mockMinimizeIncoming = jest.fn();
const mockAnswerCall = jest.fn();
const mockRejectIncomingCall = jest.fn();
const mockDismissIncomingCallNotification = jest.fn();
const mockRequestMediaPermissions = jest.fn();
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

let mockIncomingCall: any = null;
let mockParams: any = {
  id: "peer-1",
  type: "audio",
  conversationId: "conv-1",
  callId: "call-1",
  callerName: "Alice Cruz",
};

jest.mock("@/features/call/context/call-context", () => ({
  useCallContext: () => ({
    incomingCall: mockIncomingCall,
    setIncomingCall: mockSetIncomingCall,
    clearIncomingCall: mockClearIncomingCall,
    minimizeIncoming: mockMinimizeIncoming,
  }),
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}));

jest.mock("@/features/call", () => ({
  useCallService: () => ({ answerCall: mockAnswerCall, rejectIncomingCall: mockRejectIncomingCall }),
}));

jest.mock("@/features/shared/hooks", () => ({
  useConnectionService: () => ({ dismissIncomingCallNotification: mockDismissIncomingCallNotification }),
  usePeerService: () => ({ findPeerById: jest.fn().mockResolvedValue(null) }),
  useProfilePhoto: () => ({ url: null }),
  useThrottledPress: (fn: () => void) => ({ onPress: fn, busy: false }),
}));

jest.mock("@/features/shared/hooks/use-media-permissions", () => ({
  useMediaPermissions: () => ({ requestMediaPermissions: mockRequestMediaPermissions }),
}));

describe("IncomingCall ring registration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAnswerCall.mockResolvedValue(undefined);
    mockRejectIncomingCall.mockResolvedValue(undefined);
    mockDismissIncomingCallNotification.mockResolvedValue(undefined);
    mockRequestMediaPermissions.mockResolvedValue(true);
    mockIncomingCall = null;
    mockParams = {
      id: "peer-1",
      type: "audio",
      conversationId: "conv-1",
      callId: "call-1",
      callerName: "Alice Cruz",
    };
  });

  test("registers the ringing call on mount", async () => {
    const IncomingCall = require("../incoming").default;
    render(<IncomingCall />);

    await waitFor(() => expect(mockSetIncomingCall).toHaveBeenCalledTimes(1));
    expect(mockSetIncomingCall).toHaveBeenCalledWith(
      expect.objectContaining({ peerId: "peer-1", callId: "call-1", callerName: "Alice Cruz" }),
    );
  });

  // The screen lives in a bottom-tab navigator, which never unmounts a visited
  // screen. After the call is answered it stays mounted while blurred, so when
  // `clearIncomingCall()` nulls the context state the registration effect re-runs.
  // Re-registering there resurrects a ring that is already answered: the banner
  // flips back to its "Incoming call…" variant and the ringing no-answer timeout
  // re-arms and tears the live call down 30s later.
  test("does not re-register a ring it already handled once the call is answered", async () => {
    const IncomingCall = require("../incoming").default;
    const { rerender } = render(<IncomingCall />);

    await waitFor(() => expect(mockSetIncomingCall).toHaveBeenCalledTimes(1));

    // Context now holds the ring the screen just registered.
    mockIncomingCall = { peerId: "peer-1", callType: "audio", callId: "call-1" };
    rerender(<IncomingCall />);

    // Accepting the call calls clearIncomingCall(), which nulls it again while
    // this screen is still mounted (blurred behind the call room).
    mockIncomingCall = null;
    rerender(<IncomingCall />);

    await waitFor(() => expect(mockSetIncomingCall).toHaveBeenCalledTimes(1));
  });

  test("registers a genuinely new ring that arrives while the screen is still mounted", async () => {
    const IncomingCall = require("../incoming").default;
    const { rerender } = render(<IncomingCall />);

    await waitFor(() => expect(mockSetIncomingCall).toHaveBeenCalledTimes(1));

    mockIncomingCall = { peerId: "peer-1", callType: "audio", callId: "call-1" };
    rerender(<IncomingCall />);

    // Previous ring finished, a new call comes in and re-navigates to this route.
    mockIncomingCall = null;
    mockParams = {
      id: "peer-2",
      type: "video",
      conversationId: "conv-2",
      callId: "call-2",
      callerName: "Ben Reyes",
    };
    rerender(<IncomingCall />);

    await waitFor(() => expect(mockSetIncomingCall).toHaveBeenCalledTimes(2));
    expect(mockSetIncomingCall).toHaveBeenLastCalledWith(
      expect.objectContaining({ peerId: "peer-2", callId: "call-2", callerName: "Ben Reyes" }),
    );
  });

  test("moves to the call room before the permission request resolves", async () => {
    let resolvePermission: (granted: boolean) => void;
    mockRequestMediaPermissions.mockImplementation(
      () => new Promise<boolean>((resolve) => { resolvePermission = resolve; }),
    );
    const IncomingCall = require("../incoming").default;
    const { getByLabelText } = render(<IncomingCall />);

    fireEvent.press(getByLabelText("Accept call"));

    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/(drawer)/(tabs)/call/[id]",
      params: { id: "peer-1", type: "audio", status: "answering" },
    });
    expect(mockAnswerCall).not.toHaveBeenCalled();

    resolvePermission!(true);
    await waitFor(() => expect(mockAnswerCall).toHaveBeenCalledWith("audio", "peer-1", "conv-1", "call-1"));
    expect(mockClearIncomingCall).toHaveBeenCalledTimes(1);
  });

  test("returns to the incoming screen without answering when permission is denied", async () => {
    mockRequestMediaPermissions.mockResolvedValue(false);
    const IncomingCall = require("../incoming").default;
    const { getByLabelText } = render(<IncomingCall />);

    fireEvent.press(getByLabelText("Accept call"));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenLastCalledWith({
      pathname: "/(drawer)/(tabs)/call/incoming",
      params: {
        id: "peer-1",
        type: "audio",
        conversationId: "conv-1",
        callId: "call-1",
        callerName: "Alice Cruz",
      },
    }));
    expect(mockAnswerCall).not.toHaveBeenCalled();
    expect(mockClearIncomingCall).not.toHaveBeenCalled();
  });

  test("returns to the incoming screen when answering fails", async () => {
    mockAnswerCall.mockRejectedValue(new Error("answer failed"));
    const IncomingCall = require("../incoming").default;
    const { getByLabelText } = render(<IncomingCall />);

    fireEvent.press(getByLabelText("Accept call"));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenLastCalledWith({
      pathname: "/(drawer)/(tabs)/call/incoming",
      params: {
        id: "peer-1",
        type: "audio",
        conversationId: "conv-1",
        callId: "call-1",
        callerName: "Alice Cruz",
      },
    }));
    expect(mockClearIncomingCall).not.toHaveBeenCalled();
  });
});
