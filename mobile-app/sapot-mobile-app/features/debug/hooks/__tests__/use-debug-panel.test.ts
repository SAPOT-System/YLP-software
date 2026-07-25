import { act, renderHook } from "@testing-library/react-native";
import { debugPanelStore } from "../../stores/debug-panel-store";
import { useDebugPanel } from "../use-debug-panel";

afterEach(() => {
  debugPanelStore.close();
});

describe("useDebugPanel", () => {
  it("reflects the store's current open state", () => {
    const { result } = renderHook(() => useDebugPanel());

    expect(result.current.isOpen).toBe(false);
  });

  it("open() updates isOpen to true", () => {
    const { result } = renderHook(() => useDebugPanel());

    act(() => {
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
  });

  it("close() updates isOpen to false", () => {
    const { result } = renderHook(() => useDebugPanel());

    act(() => {
      result.current.open();
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
  });

  it("toggle() flips isOpen", () => {
    const { result } = renderHook(() => useDebugPanel());

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);
  });
});
