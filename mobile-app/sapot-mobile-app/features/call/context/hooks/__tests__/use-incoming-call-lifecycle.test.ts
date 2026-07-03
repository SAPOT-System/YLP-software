import { renderHook, act } from "@testing-library/react-native";
import { useIncomingCallLifecycle } from "../use-incoming-call-lifecycle";
import { captureHandler, makeCallServiceMock, makeConnectionServiceMock } from "./_helpers";

jest.useFakeTimers();

/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks */
function setup(overrides: any = {}) {
  const callService = makeCallServiceMock(overrides.callService);
  const connectionService = makeConnectionServiceMock(overrides.connectionService);
  const onIncomingCallEnded = jest.fn();
  const incomingCall =
    "incomingCall" in overrides
      ? overrides.incomingCall
      : { peerId: "p1", callType: "audio" as const, conversationId: "c1" };
  const utils = renderHook(
    (props: { incomingCall: typeof incomingCall | null }) =>
      useIncomingCallLifecycle({
        callService: callService as any,
        connectionService: connectionService as any,
        incomingCall: props.incomingCall,
        onIncomingCallEnded,
      }),
    { initialProps: { incomingCall } }
  );
  return { ...utils, callService, connectionService, onIncomingCallEnded, incomingCall };
}

describe("useIncomingCallLifecycle", () => {
  test("marks the peer active while ringing", () => {
    const { connectionService } = setup();
    expect(connectionService.setActiveCall).toHaveBeenCalledWith("p1");
  });

  test("does nothing while there is no incoming call", () => {
    const { connectionService, callService } = setup({ incomingCall: null });
    act(() => jest.advanceTimersByTime(30_000));
    expect(connectionService.setActiveCall).not.toHaveBeenCalled();
    expect(callService.markMissedIncomingCall).not.toHaveBeenCalled();
  });

  test("marks the call missed after 30s and ends it", async () => {
    const { callService, connectionService, onIncomingCallEnded } = setup();
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(connectionService.dismissIncomingCallNotification).toHaveBeenCalled();
    expect(callService.markMissedIncomingCall).toHaveBeenCalledWith("audio", "p1", "c1");
    expect(onIncomingCallEnded).toHaveBeenCalledTimes(1);
  });

  test("does not fire the no-answer timeout early", () => {
    const { callService } = setup();
    act(() => jest.advanceTimersByTime(29_000));
    expect(callService.markMissedIncomingCall).not.toHaveBeenCalled();
  });

  test("caller cancelling ends the incoming call and clears active-call state", async () => {
    const { connectionService, onIncomingCallEnded } = setup();
    await act(async () => {
      await captureHandler(connectionService, "call-ended")({ peerId: "p1" });
    });
    expect(connectionService.setActiveCall).toHaveBeenLastCalledWith(null);
    expect(connectionService.dismissIncomingCallNotification).toHaveBeenCalled();
    expect(onIncomingCallEnded).toHaveBeenCalledTimes(1);
  });

  test("ignores call-ended events for a different peer", async () => {
    const { connectionService, onIncomingCallEnded } = setup();
    await act(async () => {
      await captureHandler(connectionService, "call-ended")({ peerId: "someone-else" });
    });
    expect(onIncomingCallEnded).not.toHaveBeenCalled();
  });
});
