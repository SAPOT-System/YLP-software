import { useCallback, useEffect, useState } from "react";
import {
  DebugTableRow,
  DebugTableSummary,
  debugDbService,
} from "../services/debug-db-service";

const PAGE_SIZE = 25;

export function useDebugDb() {
  const [tables, setTables] = useState<DebugTableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [rows, setRows] = useState<DebugTableRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const refreshTables = useCallback(async () => {
    setLoading(true);
    try {
      setTables(await debugDbService.getTableSummaries());
    } finally {
      setLoading(false);
    }
  }, []);

  const selectTable = useCallback(async (tableName: string) => {
    setLoading(true);
    try {
      setSelectedTable(tableName);
      setColumns(debugDbService.getTableColumns(tableName));
      const firstPage = await debugDbService.getRows(tableName, {
        limit: PAGE_SIZE,
        offset: 0,
      });
      setRows(firstPage);
      setHasMore(firstPage.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMoreRows = useCallback(async () => {
    if (!selectedTable || !hasMore || loading) return;
    setLoading(true);
    try {
      const nextPage = await debugDbService.getRows(selectedTable, {
        limit: PAGE_SIZE,
        offset: rows.length,
      });
      setRows((prev) => [...prev, ...nextPage]);
      setHasMore(nextPage.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, [selectedTable, hasMore, loading, rows.length]);

  const deleteRow = useCallback(
    async (id: string) => {
      if (!selectedTable) return;
      setLoading(true);
      try {
        await debugDbService.deleteRow(selectedTable, id);
        setRows((prev) => prev.filter((row) => row.id !== id));
        await refreshTables();
      } finally {
        setLoading(false);
      }
    },
    [selectedTable, refreshTables]
  );

  const resetDatabase = useCallback(async () => {
    setLoading(true);
    try {
      await debugDbService.resetDatabase();
      setSelectedTable(null);
      setRows([]);
      setColumns([]);
      setHasMore(false);
      await refreshTables();
    } finally {
      setLoading(false);
    }
  }, [refreshTables]);

  const seedPeers = useCallback(
    async (count?: number) => {
      setLoading(true);
      try {
        await debugDbService.seedPeers(count);
        await refreshTables();
        if (selectedTable === "peers") await selectTable("peers");
      } finally {
        setLoading(false);
      }
    },
    [refreshTables, selectedTable, selectTable]
  );

  const clearSelection = useCallback(() => {
    setSelectedTable(null);
    setRows([]);
    setColumns([]);
    setHasMore(false);
  }, []);

  const exportToJson = useCallback(() => debugDbService.exportToJson(), []);

  const importFromJson = useCallback(
    async (json: string) => {
      setLoading(true);
      try {
        await debugDbService.importFromJson(json);
        await refreshTables();
      } finally {
        setLoading(false);
      }
    },
    [refreshTables]
  );

  useEffect(() => {
    refreshTables();
  }, [refreshTables]);

  return {
    tables,
    selectedTable,
    rows,
    columns,
    hasMore,
    loading,
    refreshTables,
    selectTable,
    loadMoreRows,
    clearSelection,
    deleteRow,
    resetDatabase,
    seedPeers,
    exportToJson,
    importFromJson,
  };
}
