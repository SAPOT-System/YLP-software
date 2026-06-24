import { renderHook, act } from "@testing-library/react-native";
import { useCallTimer } from "../use-call-timer";

jest.useFakeTimers();

describe("useCallTimer", () => {
  test("does not increment when not connected", () => {
    const { result } = renderHook(() => useCallTimer("calling"));
    act(() => jest.advanceTimersByTime(3000));
    expect(result.current.elapsed).toBe(0);
  });

  test("increments once per second while connected", () => {
    const { result } = renderHook(() => useCallTimer("connected"));
    act(() => jest.advanceTimersByTime(3000));
    expect(result.current.elapsed).toBe(3);
  });

  test("resetElapsed returns elapsed to 0", () => {
    const { result } = renderHook(() => useCallTimer("connected"));
    act(() => jest.advanceTimersByTime(2000));
    act(() => result.current.resetElapsed());
    expect(result.current.elapsed).toBe(0);
  });
});
