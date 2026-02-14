import { PeerRepository } from "../peer-repository";

describe("PeerRepository", () => {
  let repository: PeerRepository;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCollection: any;

  beforeEach(() => {
    mockCollection = {
      create: jest.fn(),
      query: jest.fn().mockReturnValue({
        fetch: jest.fn(),
      }),
    };

    mockDb = {
      get: jest.fn().mockReturnValue(mockCollection),
      write: jest.fn((fn) => fn()),
    };

    repository = new PeerRepository(mockDb);
  });

  it("saves a new peer", async () => {
    const mockPeer = {
      id: "peer-1",
      username: "Alice",
      isOnline: false,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.write.mockImplementation((fn: any) =>
      Promise.resolve(fn()).then(() => mockPeer)
    );

    await repository.savePeer({
      id: "peer-1",
      username: "Alice",
    });

    expect(mockDb.write).toHaveBeenCalled();
  });

  it("marks peer as offline", async () => {
    mockCollection.query().fetch.mockResolvedValue([
      {
        id: "peer-1",
        isOnline: true,
        update: jest.fn(),
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.write.mockImplementation((fn: any) => fn());

    await repository.markPeerOffline("peer-1");

    expect(mockDb.write).toHaveBeenCalled();
  });

  it("marks peer as online", async () => {
    mockCollection.query().fetch.mockResolvedValue([
      {
        id: "peer-1",
        isOnline: false,
        update: jest.fn(),
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.write.mockImplementation((fn: any) => fn());

    await repository.markPeerOnline("peer-1");

    expect(mockDb.write).toHaveBeenCalled();
  });

  it("checks if peer exists", async () => {
    mockCollection
      .query()
      .fetch.mockResolvedValue([{ id: "peer-1", username: "Alice" }]);

    const exists = await repository.isPeerExist("peer-1");

    expect(exists).toBe(true);
  });

  it("returns false if peer does not exist", async () => {
    mockCollection.query().fetch.mockResolvedValue([]);

    const exists = await repository.isPeerExist("peer-nonexistent");

    expect(exists).toBe(false);
  });

  it("queries peer by id", async () => {
    const mockPeer = { id: "peer-1", username: "Alice", isOnline: true };
    mockCollection.query().fetch.mockResolvedValue([mockPeer]);

    const result = await repository.queryPeerById("peer-1");

    expect(result).toEqual(mockPeer);
  });
});
