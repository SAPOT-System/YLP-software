import { act, renderHook } from "@testing-library/react-native";
import { useDelayedLoading } from "./use-delayed-loading";

const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });
interface LoadingProps { loading: boolean; }
interface KeyedLoadingProps extends LoadingProps { id: string; }

describe("useDelayedLoading", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("delays visibility until the load exceeds the flash guard", () => {
    const { result } = renderHook(() => useDelayedLoading(true));
    advance(149); expect(result.current).toBe(false);
    advance(2); expect(result.current).toBe(true);
  });

  it("never appears for a fast load", () => {
    const { result, rerender } = renderHook<boolean, LoadingProps>(({ loading }) => useDelayedLoading(loading), { initialProps: { loading: true } });
    advance(100); rerender({ loading: false }); advance(1000);
    expect(result.current).toBe(false);
  });

  it("holds visibility for the minimum duration", () => {
    const { result, rerender } = renderHook<boolean, LoadingProps>(({ loading }) => useDelayedLoading(loading), { initialProps: { loading: true } });
    advance(200); rerender({ loading: false }); advance(349);
    expect(result.current).toBe(true);
    advance(2); expect(result.current).toBe(false);
  });

  it("restarts, rather than resumes, a cancelled delay", () => {
    const { result, rerender } = renderHook<boolean, LoadingProps>(({ loading }) => useDelayedLoading(loading), { initialProps: { loading: true } });
    advance(50); rerender({ loading: false }); advance(30); rerender({ loading: true }); advance(120);
    expect(result.current).toBe(false);
  });

  it("remains visible when loading re-triggers during a hold", () => {
    const { result, rerender } = renderHook<boolean, LoadingProps>(({ loading }) => useDelayedLoading(loading), { initialProps: { loading: true } });
    advance(200); rerender({ loading: false }); advance(200); rerender({ loading: true }); advance(50);
    expect(result.current).toBe(true);
  });

  it("restarts the hold from the most recent trigger", () => {
    const { result, rerender } = renderHook<boolean, LoadingProps>(({ loading }) => useDelayedLoading(loading), { initialProps: { loading: true } });
    advance(200); rerender({ loading: false }); advance(200); rerender({ loading: true }); advance(50); rerender({ loading: false }); advance(349);
    expect(result.current).toBe(true);
    advance(2); expect(result.current).toBe(false);
  });

  it("clears visible state when resetKey changes", () => {
    const { result, rerender } = renderHook<boolean, KeyedLoadingProps>(({ loading, id }) => useDelayedLoading(loading, { resetKey: id }), { initialProps: { loading: true, id: "a" } });
    advance(200); expect(result.current).toBe(true);
    rerender({ loading: true, id: "b" }); expect(result.current).toBe(false);
    advance(160); expect(result.current).toBe(true);
  });

  it("restarts the delay when resetKey changes during pending", () => {
    const { result, rerender } = renderHook<boolean, KeyedLoadingProps>(({ loading, id }) => useDelayedLoading(loading, { resetKey: id }), { initialProps: { loading: true, id: "a" } });
    advance(100); rerender({ loading: true, id: "b" }); advance(100);
    expect(result.current).toBe(false);
    advance(60); expect(result.current).toBe(true);
  });
});
