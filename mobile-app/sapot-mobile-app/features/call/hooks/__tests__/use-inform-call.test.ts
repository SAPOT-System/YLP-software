import { act, renderHook } from "@testing-library/react-native";
import { useInformCall } from "../use-inform-call";

const mockInformPeerForIncomingCall = jest.fn();
const mockRequestMediaPermissions = jest.fn();

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("../use-call-service", () => ({
  useCallService: () => ({ informPeerForIncomingCall: mockInformPeerForIncomingCall }),
}));
jest.mock("@/features/shared/hooks/use-media-permissions", () => ({
  useMediaPermissions: () => ({ requestMediaPermissions: mockRequestMediaPermissions }),
}));

const mockRouter = jest.requireMock("expo-router").router as {
  push: jest.Mock;
  back: jest.Mock;
};

describe("useInformCall", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInformPeerForIncomingCall.mockResolvedValue(undefined);
    mockRequestMediaPermissions.mockResolvedValue(true);
  });

  test("navigates to the call room before permissions resolve", async () => {
    let resolvePermission: (granted: boolean) => void;
    mockRequestMediaPermissions.mockImplementation(
      () => new Promise<boolean>((resolve) => { resolvePermission = resolve; }),
    );
    const { result } = renderHook(() => useInformCall());

    let callPromise: Promise<void>;
    act(() => { callPromise = result.current("audio", "peer-1"); });

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/(drawer)/(tabs)/call/[id]",
      params: { id: "peer-1", type: "audio", status: "calling" },
    });
    expect(mockInformPeerForIncomingCall).not.toHaveBeenCalled();

    await act(async () => { resolvePermission!(true); await callPromise!; });
    expect(mockInformPeerForIncomingCall).toHaveBeenCalledWith("audio", "peer-1");
  });

  test("returns to the previous screen when permission is denied", async () => {
    mockRequestMediaPermissions.mockResolvedValue(false);
    const { result } = renderHook(() => useInformCall());

    await act(async () => { await result.current("video", "peer-1"); });

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockInformPeerForIncomingCall).not.toHaveBeenCalled();
  });

  test("returns to the previous screen when signalling fails", async () => {
    mockInformPeerForIncomingCall.mockRejectedValue(new Error("signalling failed"));
    const { result } = renderHook(() => useInformCall());

    await act(async () => { await result.current("audio", "peer-1"); });

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});
