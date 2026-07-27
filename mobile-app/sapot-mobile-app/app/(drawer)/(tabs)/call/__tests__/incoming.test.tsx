/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks */
import { render, waitFor } from "@testing-library/react-native";
import React from "react";

const mockSetIncomingCall = jest.fn();
const mockClearIncomingCall = jest.fn();
const mockMinimizeIncoming = jest.fn();

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
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/features/call", () => ({
  useCallService: () => ({ answerCall: jest.fn(), rejectIncomingCall: jest.fn() }),
}));

jest.mock("@/features/shared/hooks", () => ({
  useConnectionService: () => ({ dismissIncomingCallNotification: jest.fn() }),
  usePeerService: () => ({ findPeerById: jest.fn().mockResolvedValue(null) }),
  useProfilePhoto: () => ({ url: null }),
  useThrottledPress: (fn: () => void) => ({ onPress: fn, busy: false }),
}));

jest.mock("@/features/shared/hooks/use-media-permissions", () => ({
  useMediaPermissions: () => ({ requestMediaPermissions: jest.fn().mockResolvedValue(true) }),
}));

describe("IncomingCall ring registration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
