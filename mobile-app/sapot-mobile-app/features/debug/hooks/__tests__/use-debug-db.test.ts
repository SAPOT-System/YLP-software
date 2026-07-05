import { act, renderHook, waitFor } from "@testing-library/react-native";
import { debugDbService } from "../../services/debug-db-service";
import { useDebugDb } from "../use-debug-db";

jest.mock("../../services/debug-db-service", () => ({
  debugDbService: {
    getTableSummaries: jest.fn(),
    getRows: jest.fn(),
    getTableColumns: jest.fn(),
    deleteRow: jest.fn(),
    resetDatabase: jest.fn(),
    seedPeers: jest.fn(),
    exportToJson: jest.fn(),
    importFromJson: jest.fn(),
  },
}));

const mockedService = debugDbService as jest.Mocked<typeof debugDbService>;

describe("useDebugDb", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedService.getTableSummaries.mockResolvedValue([
      { name: "peers", rowCount: 1 },
    ]);
    mockedService.getRows.mockResolvedValue([
      { id: "peer-1", fields: { id: "peer-1", username: "alice" } },
    ]);
    mockedService.getTableColumns.mockReturnValue(["username"]);
  });

  it("loads table summaries on mount", async () => {
    const { result } = renderHook(() => useDebugDb());

    await waitFor(() =>
      expect(result.current.tables).toEqual([{ name: "peers", rowCount: 1 }])
    );
    expect(mockedService.getTableSummaries).toHaveBeenCalledTimes(1);
  });

  it("selectTable loads the first page of rows for the chosen table", async () => {
    const { result } = renderHook(() => useDebugDb());
    await waitFor(() => expect(mockedService.getTableSummaries).toHaveBeenCalled());

    await act(async () => {
      await result.current.selectTable("peers");
    });

    expect(mockedService.getRows).toHaveBeenCalledWith("peers", {
      limit: 25,
      offset: 0,
    });
    expect(mockedService.getTableColumns).toHaveBeenCalledWith("peers");
    expect(result.current.selectedTable).toBe("peers");
    expect(result.current.columns).toEqual(["username"]);
    expect(result.current.rows).toEqual([
      { id: "peer-1", fields: { id: "peer-1", username: "alice" } },
    ]);
  });

  it("marks hasMore when a full page is returned, and loadMoreRows appends the next page", async () => {
    const fullPage = Array.from({ length: 25 }, (_, i) => ({
      id: `peer-${i}`,
      fields: { id: `peer-${i}` },
    }));
    mockedService.getRows.mockResolvedValueOnce(fullPage);

    const { result } = renderHook(() => useDebugDb());
    await act(async () => {
      await result.current.selectTable("peers");
    });

    expect(result.current.hasMore).toBe(true);

    mockedService.getRows.mockResolvedValueOnce([
      { id: "peer-25", fields: { id: "peer-25" } },
    ]);

    await act(async () => {
      await result.current.loadMoreRows();
    });

    expect(mockedService.getRows).toHaveBeenLastCalledWith("peers", {
      limit: 25,
      offset: 25,
    });
    expect(result.current.rows).toHaveLength(26);
    expect(result.current.hasMore).toBe(false);
  });

  it("loadMoreRows is a no-op when there is no more data", async () => {
    const { result } = renderHook(() => useDebugDb());
    await act(async () => {
      await result.current.selectTable("peers");
    });

    expect(result.current.hasMore).toBe(false);
    mockedService.getRows.mockClear();

    await act(async () => {
      await result.current.loadMoreRows();
    });

    expect(mockedService.getRows).not.toHaveBeenCalled();
  });

  it("deleteRow removes the row locally without refetching, and refreshes table counts", async () => {
    const { result } = renderHook(() => useDebugDb());
    await act(async () => {
      await result.current.selectTable("peers");
    });

    mockedService.getRows.mockClear();

    await act(async () => {
      await result.current.deleteRow("peer-1");
    });

    expect(mockedService.deleteRow).toHaveBeenCalledWith("peers", "peer-1");
    expect(mockedService.getRows).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);
  });

  it("deleteRow is a no-op when no table is selected", async () => {
    const { result } = renderHook(() => useDebugDb());
    await waitFor(() => expect(mockedService.getTableSummaries).toHaveBeenCalled());

    await act(async () => {
      await result.current.deleteRow("peer-1");
    });

    expect(mockedService.deleteRow).not.toHaveBeenCalled();
  });

  it("clearSelection resets selectedTable and rows", async () => {
    const { result } = renderHook(() => useDebugDb());
    await act(async () => {
      await result.current.selectTable("peers");
    });

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedTable).toBeNull();
    expect(result.current.rows).toEqual([]);
    expect(result.current.columns).toEqual([]);
  });

  it("resetDatabase clears selection and refreshes tables", async () => {
    const { result } = renderHook(() => useDebugDb());
    await act(async () => {
      await result.current.selectTable("peers");
    });

    await act(async () => {
      await result.current.resetDatabase();
    });

    expect(mockedService.resetDatabase).toHaveBeenCalled();
    expect(result.current.selectedTable).toBeNull();
    expect(result.current.rows).toEqual([]);
  });

  it("seedPeers seeds then refreshes tables", async () => {
    const { result } = renderHook(() => useDebugDb());
    await waitFor(() => expect(mockedService.getTableSummaries).toHaveBeenCalled());

    await act(async () => {
      await result.current.seedPeers(3);
    });

    expect(mockedService.seedPeers).toHaveBeenCalledWith(3);
    expect(mockedService.getTableSummaries).toHaveBeenCalledTimes(2);
  });

  it("exportToJson delegates to the service", async () => {
    mockedService.exportToJson.mockResolvedValue("{}");
    const { result } = renderHook(() => useDebugDb());

    const json = await act(async () => result.current.exportToJson());

    expect(json).toBe("{}");
    expect(mockedService.exportToJson).toHaveBeenCalled();
  });

  it("importFromJson imports then refreshes tables", async () => {
    const { result } = renderHook(() => useDebugDb());
    await waitFor(() => expect(mockedService.getTableSummaries).toHaveBeenCalled());

    await act(async () => {
      await result.current.importFromJson("{}");
    });

    expect(mockedService.importFromJson).toHaveBeenCalledWith("{}");
    expect(mockedService.getTableSummaries).toHaveBeenCalledTimes(2);
  });
});
