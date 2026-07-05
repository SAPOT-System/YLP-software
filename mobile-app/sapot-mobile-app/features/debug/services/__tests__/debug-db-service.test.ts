import { DebugDbService } from "../debug-db-service";

interface FakeRecord {
  id: string;
  _raw: Record<string, unknown>;
  prepareDestroyPermanently: jest.Mock;
}

const createFakeRecord = (
  id: string,
  fields: Record<string, unknown> = {}
): FakeRecord => ({
  id,
  _raw: { id, ...fields },
  prepareDestroyPermanently: jest.fn().mockReturnValue({ op: "destroy", id }),
});

const createFakeCollection = (records: FakeRecord[]) => ({
  query: jest.fn(() => ({ fetch: jest.fn().mockResolvedValue(records) })),
  prepareCreate: jest.fn((builder: (record: FakeRecord) => void) => {
    const record = createFakeRecord("new-id");
    builder(record);
    return { op: "create", id: record.id, raw: record._raw };
  }),
});

describe("DebugDbService", () => {
  let peers: FakeRecord[];
  let messages: FakeRecord[];
  let db: {
    schema: { tables: Record<string, unknown> };
    get: jest.Mock;
    write: jest.Mock;
    batch: jest.Mock;
    unsafeResetDatabase: jest.Mock;
  };
  let service: DebugDbService;

  beforeEach(() => {
    peers = [createFakeRecord("peer-1", { username: "alice" })];
    messages = [
      createFakeRecord("msg-1", { content: "hi" }),
      createFakeRecord("msg-2", { content: "there" }),
    ];

    const collections: Record<string, ReturnType<typeof createFakeCollection>> = {
      peers: createFakeCollection(peers),
      messages: createFakeCollection(messages),
    };

    db = {
      schema: { tables: { peers: {}, messages: {} } },
      get: jest.fn((tableName: string) => collections[tableName]),
      write: jest.fn((fn: () => Promise<void>) => fn()),
      batch: jest.fn().mockResolvedValue(undefined),
      unsafeResetDatabase: jest.fn().mockResolvedValue(undefined),
    };

    service = new DebugDbService(db as never);
  });

  describe("listTableNames", () => {
    it("returns every table name from the schema", () => {
      expect(service.listTableNames()).toEqual(["peers", "messages"]);
    });
  });

  describe("getTableSummaries", () => {
    it("returns a row count per table", async () => {
      const summaries = await service.getTableSummaries();
      expect(summaries).toEqual([
        { name: "peers", rowCount: 1 },
        { name: "messages", rowCount: 2 },
      ]);
    });
  });

  describe("getRows", () => {
    it("maps records to id + raw field data", async () => {
      const rows = await service.getRows("peers");
      expect(rows).toEqual([{ id: "peer-1", fields: { id: "peer-1", username: "alice" } }]);
    });
  });

  describe("deleteRow", () => {
    it("destroys the matching record inside a writer", async () => {
      await service.deleteRow("messages", "msg-1");

      expect(db.write).toHaveBeenCalled();
      expect(messages[0].prepareDestroyPermanently).toHaveBeenCalled();
      expect(db.batch).toHaveBeenCalledWith({ op: "destroy", id: "msg-1" });
    });

    it("is a no-op when the id does not exist", async () => {
      await service.deleteRow("messages", "missing-id");
      expect(db.batch).not.toHaveBeenCalled();
    });

    it("rethrows on failure", async () => {
      db.write.mockRejectedValueOnce(new Error("boom"));
      await expect(service.deleteRow("messages", "msg-1")).rejects.toThrow("boom");
    });
  });

  describe("resetDatabase", () => {
    it("calls unsafeResetDatabase inside a writer", async () => {
      await service.resetDatabase();
      expect(db.write).toHaveBeenCalled();
      expect(db.unsafeResetDatabase).toHaveBeenCalled();
    });

    it("rethrows on failure", async () => {
      db.unsafeResetDatabase.mockRejectedValueOnce(new Error("reset failed"));
      await expect(service.resetDatabase()).rejects.toThrow("reset failed");
    });
  });

  describe("seedPeers", () => {
    it("batches the requested number of prepared peer creates", async () => {
      await service.seedPeers(3);
      expect(db.batch).toHaveBeenCalledTimes(1);
      expect(db.batch.mock.calls[0]).toHaveLength(3);
    });

    it("defaults to seeding 5 peers", async () => {
      await service.seedPeers();
      expect(db.batch.mock.calls[0]).toHaveLength(5);
    });
  });

  describe("exportToJson", () => {
    it("serializes every table's rows keyed by table name", async () => {
      const json = await service.exportToJson();
      const parsed = JSON.parse(json);

      expect(parsed.tables.peers).toEqual([{ id: "peer-1", username: "alice" }]);
      expect(parsed.tables.messages).toEqual([
        { id: "msg-1", content: "hi" },
        { id: "msg-2", content: "there" },
      ]);
      expect(typeof parsed.exportedAt).toBe("string");
    });
  });

  describe("importFromJson", () => {
    it("recreates rows for each table inside a writer", async () => {
      const payload = JSON.stringify({
        exportedAt: "2026-01-01T00:00:00.000Z",
        tables: {
          peers: [{ id: "peer-import", username: "bob" }],
        },
      });

      await service.importFromJson(payload);

      expect(db.write).toHaveBeenCalled();
      expect(db.batch).toHaveBeenCalledWith(
        expect.objectContaining({
          op: "create",
          raw: expect.objectContaining({ username: "bob" }),
        })
      );
    });

    it("throws on invalid JSON without touching the database", async () => {
      await expect(service.importFromJson("not json")).rejects.toThrow();
      expect(db.write).not.toHaveBeenCalled();
    });
  });
});
