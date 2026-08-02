import { renderHook, waitFor, act } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { useReducedMotion } from "../use-reduced-motion";

describe("useReducedMotion", () => {
  let changeHandler: (enabled: boolean) => void;
  let removeMock: jest.Mock;

  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(
      false
    );
    removeMock = jest.fn();
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for a native event emitter
      .mockImplementation(((_event: string, handler: any) => {
        changeHandler = handler;
        return { remove: removeMock };
      }) as unknown as typeof AccessibilityInfo.addEventListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns false by default before the OS setting resolves", () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("reflects the initial isReduceMotionEnabled value", async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(
      true
    );

    const { result } = renderHook(() => useReducedMotion());

    await waitFor(() => expect(result.current).toBe(true));
  });

  it("updates when the OS setting changes", async () => {
    const { result } = renderHook(() => useReducedMotion());

    await waitFor(() => expect(changeHandler).toBeDefined());

    act(() => {
      changeHandler(true);
    });

    expect(result.current).toBe(true);
  });

  it("removes the listener on unmount", async () => {
    const { unmount } = renderHook(() => useReducedMotion());

    await waitFor(() => expect(changeHandler).toBeDefined());

    unmount();

    expect(removeMock).toHaveBeenCalled();
  });
});
