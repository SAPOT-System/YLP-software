import { renderHook, act } from "@testing-library/react-native";
import { useCallLifecycle } from "../use-call-lifecycle";
import { captureHandler, makeCallServiceMock, makeConnectionServiceMock } from "./_helpers";

jest.useFakeTimers();

/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks */
function setup(overrides: any = {}) {
  const callService = makeCallServiceMock(overrides.callService);
  const connectionService = makeConnectionServiceMock(overrides.connectionService);
  const onCallEnded = jest.fn();
  const utils = renderHook<ReturnType<typeof useCallLifecycle>, void>(() =>
    useCallLifecycle({
      callService: callService as any,
      connectionService: connectionService as any,
      peerId: "p1",
      callType: "audio",
      isMinimized: false,
      onCallEnded,
    })
  );
  return { ...utils, callService, connectionService, onCallEnded };
}

describe("useCallLifecycle", () => {
  test("starts in 'calling'", () => {
    expect(setup().result.current.callState).toBe("calling");
  });

  test("call-ready starts the call with (type, peerId)", () => {
    const { connectionService, callService } = setup();
    act(() => captureHandler(connectionService, "call-ready")("p1"));
    expect(callService.startCall).toHaveBeenCalledWith("audio", "p1");
  });

  test("call-busy sets state to 'busy'", () => {
    const { result, connectionService, rerender } = setup();
    act(() => captureHandler(connectionService, "call-busy")("p1", {}));
    rerender();
    expect(result.current.callState).toBe("busy");
  });

  test("call-busy is ignored on glare", () => {
    const { result, connectionService, rerender } = setup({
      connectionService: { shouldIgnoreCallBusy: jest.fn().mockReturnValue(true) },
    });
    act(() => captureHandler(connectionService, "call-busy")("p1", {}));
    rerender();
    expect(result.current.callState).toBe("calling");
  });

  test("no-answer after 30s sets 'no-answer' and terminates as missed", () => {
    const { result, callService, rerender } = setup();
    act(() => jest.advanceTimersByTime(30_000));
    rerender();
    expect(result.current.callState).toBe("no-answer");
    expect(callService.terminateCallConnection).toHaveBeenCalledWith("p1", "missed");
  });

  test("remote call-ended (completed) → 'ended' and finalizes", async () => {
    const { result, connectionService, callService, rerender } = setup();
    await act(async () => {
      await captureHandler(connectionService, "call-ended")({ peerId: "p1", status: "completed" });
    });
    rerender();
    expect(callService.handleRemoteCallEnded).toHaveBeenCalled();
    expect(result.current.callState).toBe("ended");
  });

  test("stale call-ended (mismatched callId) is ignored", async () => {
    const { connectionService, callService } = setup({
      callService: { getActiveCallId: jest.fn().mockReturnValue("current") },
    });
    await act(async () => {
      await captureHandler(connectionService, "call-ended")({ peerId: "p1", callId: "old", status: "completed" });
    });
    expect(callService.handleRemoteCallEnded).not.toHaveBeenCalled();
  });

  test("peer-disconnected → after 1.5s terminates missed if no call-ended", () => {
    const { result, callService, connectionService, rerender } = setup();
    act(() => captureHandler(connectionService, "peer-disconnected")("p1"));
    act(() => jest.advanceTimersByTime(1500));
    rerender();
    expect(callService.terminateCallConnection).toHaveBeenCalledWith("p1", "missed");
    expect(result.current.callState).toBe("ended");
  });

  test("resetLifecycle returns state to 'calling'", () => {
    const { result, connectionService, rerender } = setup();
    act(() => captureHandler(connectionService, "call-busy")("p1", {}));
    act(() => result.current.resetLifecycle());
    rerender();
    expect(result.current.callState).toBe("calling");
  });
});
