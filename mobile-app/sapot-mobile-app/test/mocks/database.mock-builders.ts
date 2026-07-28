type QueryResult<T> = {
  fetch: jest.Mock<Promise<T[]>, []>;
};

export interface CollectionMock<T> {
  create: jest.Mock;
  prepareCreate: jest.Mock;
  query: jest.Mock<QueryResult<T>, []>;
}

export interface WatermelonDbMock<T = unknown> {
  get: jest.Mock<CollectionMock<T>, []>;
  write: jest.Mock;
  batch: jest.Mock;
}

export function createCollectionMock<T = unknown>(
  fetchResult: T[] = []
): CollectionMock<T> {
  const fetch = jest.fn<Promise<T[]>, []>().mockResolvedValue(fetchResult);
  return {
    create: jest.fn(),
    prepareCreate: jest.fn((builder: (record: T) => void) => {
      const record = {
        _raw: {},
        sender: { set: jest.fn() },
        conversation: { set: jest.fn() },
      } as unknown as T;
      builder(record);
      return record;
    }),
    query: jest.fn().mockReturnValue({ fetch }),
  };
}

export function createWatermelonDbMock<T = unknown>(
  collection: CollectionMock<T>
): WatermelonDbMock<T> {
  return {
    get: jest.fn().mockReturnValue(collection),
    write: jest.fn((fn: () => unknown) => fn()),
    batch: jest.fn(),
  };
}

export function createDestroyableRecord(op: unknown = { op: "destroy-op" }) {
  return {
    prepareDestroyPermanently: jest.fn().mockReturnValue(op),
  };
}

export function createUpdatableRecord(
  overrides: Record<string, unknown> = {}
) {
  return {
    update: jest.fn(),
    ...overrides,
  };
}
