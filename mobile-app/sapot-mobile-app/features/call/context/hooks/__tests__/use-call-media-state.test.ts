/* eslint-disable @typescript-eslint/no-explicit-any */
import { renderHook, act } from "@testing-library/react-native";
import { useCallMediaState } from "../use-call-media-state";
import { captureHandler, makeCallServiceMock, makeConnectionServiceMock } from "./_helpers";

function setup(callState = "calling", peerId: string | null = "p1") {
  const callService = makeCallServiceMock();
  const connectionService = makeConnectionServiceMock();
  const refreshLocalCam = jest.fn();
  const utils = renderHook(
    (props: { callState: string }) =>
      useCallMediaState({
        callService: callService as any,
        connectionService: connectionService as any,
        peerId,
        callState: props.callState as any,
        refreshLocalCam,
      }),
    { initialProps: { callState } }
  );
  return { ...utils, callService, connectionService, refreshLocalCam };
}

describe("useCallMediaState", () => {
  test("defaults: all on", () => {
    const { result } = setup();
    expect(result.current.localMic).toBe(true);
    expect(result.current.remoteCam).toBe(true);
  });

  test("mic-off from peer sets remoteMic false", () => {
    const { result, connectionService, rerender } = setup();
    act(() => captureHandler(connectionService, "mic-off")("p1"));
    rerender({ callState: "calling" });
    expect(result.current.remoteMic).toBe(false);
  });

  test("mic-off for a different peer is ignored", () => {
    const { result, connectionService, rerender } = setup();
    act(() => captureHandler(connectionService, "mic-off")("other"));
    rerender({ callState: "calling" });
    expect(result.current.remoteMic).toBe(true);
  });

  test("handleToggleMic flips localMic and calls service", () => {
    const { result, callService } = setup();
    act(() => result.current.handleToggleMic());
    expect(callService.toggleMic).toHaveBeenCalledWith("p1");
    expect(result.current.localMic).toBe(false);
  });

  test("syncs media state once when connected", () => {
    const { callService, rerender } = setup("calling");
    rerender({ callState: "connected" });
    expect(callService.syncMediaState).toHaveBeenCalledWith("p1", true, true);
    callService.syncMediaState.mockClear();
    rerender({ callState: "connected" });
    expect(callService.syncMediaState).not.toHaveBeenCalled();
  });

  test("resetMedia('audio') sets cam flags false", () => {
    const { result, rerender } = setup();
    act(() => result.current.resetMedia("audio"));
    rerender({ callState: "calling" });
    expect(result.current.localCam).toBe(false);
    expect(result.current.remoteCam).toBe(false);
  });
});
