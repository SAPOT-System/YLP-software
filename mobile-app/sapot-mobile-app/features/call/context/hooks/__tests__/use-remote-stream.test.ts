import { renderHook, act } from "@testing-library/react-native";
import { useRemoteStream } from "../use-remote-stream";
import { captureHandler, makeCallServiceMock } from "./_helpers";

describe("useRemoteStream", () => {
  test("on remoteStream sets url, bumps version, calls onConnected", () => {
    const callService = makeCallServiceMock();
    const onConnected = jest.fn();
    const { result, rerender } = renderHook(() =>
      useRemoteStream({ callService: callService as any, callState: "calling", peerId: "p1", onConnected })
    );
    act(() => captureHandler(callService, "remoteStream")({ toURL: () => "stream://1", id: "s1", getTracks: () => [] }));
    rerender({});
    expect(result.current.remoteStreamUrl).toBe("stream://1");
    expect(result.current.remoteStreamVersion).toBe(1);
    expect(onConnected).toHaveBeenCalledTimes(1);
  });

  test("resetRemoteStream clears url", () => {
    const callService = makeCallServiceMock();
    const { result, rerender } = renderHook(() =>
      useRemoteStream({ callService: callService as any, callState: "calling", peerId: "p1", onConnected: jest.fn() })
    );
    act(() => captureHandler(callService, "remoteStream")({ toURL: () => "stream://1", getTracks: () => [] }));
    act(() => result.current.resetRemoteStream());
    rerender({});
    expect(result.current.remoteStreamUrl).toBeUndefined();
  });
});
