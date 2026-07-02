import { act, renderHook } from "@testing-library/react-native";
import { Subject } from "rxjs";
import { useObservedPeer } from "./use-observed-peer";

// One Subject per observed peerId so a test can drive emissions over time
// (row absent → row appears) and assert the self-healing behavior. Names are
// `mock`-prefixed so jest.mock factories may reference them out of scope.
const mockSubjects = new Map<string, Subject<unknown[]>>();
const mockUnsubscribeSpy = jest.fn();

const mockGetSubject = (peerId: string): Subject<unknown[]> => {
  let subject = mockSubjects.get(peerId);
  if (!subject) {
    subject = new Subject<unknown[]>();
    mockSubjects.set(peerId, subject);
  }
  return subject;
};

jest.mock("@/features/shared", () => ({
  database: {
    get: () => ({
      query: (clause: { peerId: string }) => ({
        observe: () => ({
          subscribe: (observer: {
            next: (rows: unknown[]) => void;
            error: (err: unknown) => void;
          }) => {
            const sub = mockGetSubject(clause.peerId).subscribe(observer);
            return {
              unsubscribe: () => {
                mockUnsubscribeSpy();
                sub.unsubscribe();
              },
            };
          },
        }),
      }),
    }),
  },
  Peer: { table: "peers" },
}));

jest.mock("@/features/shared/core/utils/logger", () => ({
  uiLog: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// Q.where returns a tagged clause carrying the queried id so the mocked
// query() above can route to the right Subject.
jest.mock("@nozbe/watermelondb", () => ({
  Q: { where: (_column: string, peerId: string) => ({ peerId }) },
}));

describe("useObservedPeer", () => {
  beforeEach(() => {
    mockSubjects.clear();
    mockUnsubscribeSpy.mockClear();
  });

  it("returns undefined when no peerId is provided", () => {
    const { result } = renderHook(() => useObservedPeer(undefined));
    expect(result.current).toBeUndefined();
  });

  it("returns the peer once the row is emitted", () => {
    const peer = { id: "peer-1", firstName: "Alice" };
    const { result } = renderHook(() => useObservedPeer("peer-1"));

    act(() => mockGetSubject("peer-1").next([peer]));

    expect(result.current).toBe(peer);
  });

  it("stays undefined while the row is absent, then self-heals when it appears", () => {
    const peer = { id: "peer-2", firstName: "Bob" };
    const { result } = renderHook(() => useObservedPeer("peer-2"));

    // Row missing at subscribe time — query emits an empty result, not an error.
    act(() => mockGetSubject("peer-2").next([]));
    expect(result.current).toBeUndefined();

    // Row gets created later — the same subscription re-emits it.
    act(() => mockGetSubject("peer-2").next([peer]));
    expect(result.current).toBe(peer);
  });

  it("resets and re-subscribes when peerId changes", () => {
    const first = { id: "peer-1", firstName: "Alice" };
    const second = { id: "peer-2", firstName: "Bob" };
    const { result, rerender } = renderHook(
      ({ peerId }: { peerId: string }) => useObservedPeer(peerId),
      { initialProps: { peerId: "peer-1" } }
    );

    act(() => mockGetSubject("peer-1").next([first]));
    expect(result.current).toBe(first);

    rerender({ peerId: "peer-2" });
    // Old subscription torn down; new peer not yet emitted.
    expect(mockUnsubscribeSpy).toHaveBeenCalled();
    expect(result.current).toBeUndefined();

    act(() => mockGetSubject("peer-2").next([second]));
    expect(result.current).toBe(second);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useObservedPeer("peer-1"));
    unmount();
    expect(mockUnsubscribeSpy).toHaveBeenCalled();
  });
});
