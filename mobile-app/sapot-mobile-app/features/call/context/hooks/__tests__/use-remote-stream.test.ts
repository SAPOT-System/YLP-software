/* eslint-disable @typescript-eslint/no-explicit-any */
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

  // The callee answers before navigating to the call room, so media can land
  // before the room mounts and runs resetCallState. `remoteStream` is an
  // edge-triggered event that never fires again, so the reset must re-read the
  // stream the service is holding instead of blindly discarding it — otherwise
  // the call sits on "calling" until the 30s no-answer timeout kills it.
  test("resetRemoteStream re-adopts a stream that arrived before the reset", () => {
    const stream = { toURL: () => "stream://live", id: "s1", getTracks: () => [] };
    const callService = makeCallServiceMock({
      getRemoteStream: jest.fn().mockReturnValue(stream),
    });
    const onConnected = jest.fn();
    const { result, rerender } = renderHook(() =>
      useRemoteStream({ callService: callService as any, callState: "calling", peerId: "p1", onConnected })
    );

    act(() => result.current.resetRemoteStream());
    rerender({});

    expect(result.current.remoteStreamUrl).toBe("stream://live");
    expect(onConnected).toHaveBeenCalledTimes(1);
  });

  test("resetRemoteStream clears when the service holds no stream", () => {
    const callService = makeCallServiceMock({
      getRemoteStream: jest.fn().mockReturnValue(null),
    });
    const onConnected = jest.fn();
    const { result, rerender } = renderHook(() =>
      useRemoteStream({ callService: callService as any, callState: "calling", peerId: "p1", onConnected })
    );
    act(() => captureHandler(callService, "remoteStream")({ toURL: () => "stream://1", getTracks: () => [] }));

    act(() => result.current.resetRemoteStream());
    rerender({});

    expect(result.current.remoteStreamUrl).toBeUndefined();
    expect(onConnected).toHaveBeenCalledTimes(1); // only the original event
  });
});
