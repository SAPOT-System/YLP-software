import { renderHook, waitFor } from "@testing-library/react-native";
import { usePeerInfo } from "../use-peer-info";

const mockFindPeerById = jest.fn();
jest.mock("@/features/shared/hooks/use-peer-service", () => ({
  usePeerService: () => ({ findPeerById: mockFindPeerById }),
}));
jest.mock("@/features/shared/hooks/use-profile-photo", () => ({
  useProfilePhoto: () => ({ url: "photo://x" }),
}));

describe("usePeerInfo", () => {
  beforeEach(() => mockFindPeerById.mockReset());

  test("returns empty name and null peer when peerId is null", () => {
    const { result } = renderHook(() => usePeerInfo(null));
    expect(result.current.peer).toBeNull();
    expect(result.current.peerDisplayName).toBe("");
  });

  test("loads peer and derives display name", async () => {
    mockFindPeerById.mockResolvedValue({ firstName: "Ada", lastName: "Lovelace" });
    const { result } = renderHook(() => usePeerInfo("p1"));
    await waitFor(() => expect(result.current.peerDisplayName).toBe("Ada Lovelace"));
    expect(result.current.peerPhotoUrl).toBe("photo://x");
  });
});
