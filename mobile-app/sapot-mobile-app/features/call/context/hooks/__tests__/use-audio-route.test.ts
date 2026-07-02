/* eslint-disable @typescript-eslint/no-explicit-any */
import { renderHook, act } from "@testing-library/react-native";
import { useAudioRoute } from "../use-audio-route";
import { captureHandler, makeCallServiceMock } from "./_helpers";

describe("useAudioRoute", () => {
  test("handleVolume toggles the speaker", () => {
    const callService = makeCallServiceMock();
    const { result } = renderHook(() => useAudioRoute(callService as any));
    act(() => result.current.handleVolume());
    expect(callService.toggleSpeaker).toHaveBeenCalledTimes(1);
  });

  test("updates currentRoute when audio-route-changed fires", () => {
    const callService = makeCallServiceMock();
    const { result, rerender } = renderHook(() => useAudioRoute(callService as any));
    act(() => captureHandler(callService, "audio-route-changed")({ route: "speaker", available: [] }));
    rerender({});
    expect(result.current.currentRoute).toBe("speaker");
  });

  test("unsubscribes on unmount", () => {
    const callService = makeCallServiceMock();
    const { unmount } = renderHook(() => useAudioRoute(callService as any));
    unmount();
    expect(callService.off).toHaveBeenCalledWith("audio-route-changed", expect.any(Function));
  });
});
