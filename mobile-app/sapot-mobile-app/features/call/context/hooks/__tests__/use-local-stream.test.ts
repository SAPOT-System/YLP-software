import { renderHook, act } from "@testing-library/react-native";
import { useLocalStream } from "../use-local-stream";
import { captureHandler, makeCallServiceMock } from "./_helpers";

describe("useLocalStream", () => {
  test("gets local cam on mount for video calls", () => {
    const stream = { toURL: () => "local://1" };
    const callService = makeCallServiceMock({ getLocalCam: jest.fn().mockReturnValue(stream) });
    const { result } = renderHook(() =>
      useLocalStream({ callService: callService as any, peerId: "p1", callType: "video", callState: "calling" })
    );
    expect(callService.getLocalCam).toHaveBeenCalledWith("p1");
    expect(result.current.localStream).toBe(stream);
  });

  test("does not get local cam for audio calls", () => {
    const callService = makeCallServiceMock();
    renderHook(() =>
      useLocalStream({ callService: callService as any, peerId: "p1", callType: "audio", callState: "calling" })
    );
    expect(callService.getLocalCam).not.toHaveBeenCalled();
  });

  test("switch-cam event updates the stream", () => {
    const callService = makeCallServiceMock();
    const { result, rerender } = renderHook(() =>
      useLocalStream({ callService: callService as any, peerId: "p1", callType: "video", callState: "connected" })
    );
    const next = { toURL: () => "local://2" };
    act(() => captureHandler(callService, "switch-cam")(next));
    rerender({});
    expect(result.current.localStream).toBe(next);
  });

  test("resetLocalStream clears the stream", () => {
    const callService = makeCallServiceMock({ getLocalCam: jest.fn().mockReturnValue({ toURL: () => "x" }) });
    const { result, rerender } = renderHook(() =>
      useLocalStream({ callService: callService as any, peerId: "p1", callType: "video", callState: "calling" })
    );
    act(() => result.current.resetLocalStream());
    rerender({});
    expect(result.current.localStream).toBeUndefined();
  });
});
