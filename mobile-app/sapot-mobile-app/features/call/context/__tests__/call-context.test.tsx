/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks */
import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

const mockCallService: any = { on: jest.fn(), off: jest.fn(), getLocalCam: jest.fn(), toggleSpeaker: jest.fn() };
const mockConnectionService: any = { on: jest.fn(), off: jest.fn(), shouldIgnoreCallBusy: jest.fn(() => false) };

jest.mock("@/features/call/hooks/use-call-service", () => ({ useCallService: () => mockCallService }));
jest.mock("@/features/shared/hooks/use-connection-service", () => ({ useConnectionService: () => mockConnectionService }));
jest.mock("@/features/shared/hooks/use-peer-service", () => ({ usePeerService: () => ({ findPeerById: jest.fn().mockResolvedValue(null) }) }));
jest.mock("@/features/shared/hooks/use-profile-photo", () => ({ useProfilePhoto: () => ({ url: null }) }));

describe("CallProvider", () => {
  test("provides default call state to consumers", async () => {
    const { CallProvider, useCallContext } = require("../call-context");
    const Consumer = () => {
      const { callState, elapsed } = useCallContext();
      return <Text testID="state">{`${callState}:${elapsed}`}</Text>;
    };
    const { getByTestId } = render(<CallProvider><Consumer /></CallProvider>);
    await waitFor(() => expect(getByTestId("state").props.children).toBe("calling:0"));
  });

  test("registers listeners on both services", () => {
    const { CallProvider } = require("../call-context");
    render(<CallProvider>{null}</CallProvider>);
    expect(mockConnectionService.on).toHaveBeenCalledWith("call-ended", expect.any(Function));
    expect(mockCallService.on).toHaveBeenCalledWith("remoteStream", expect.any(Function));
  });
});
