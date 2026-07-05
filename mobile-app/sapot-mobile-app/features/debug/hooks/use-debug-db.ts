import { useCallback, useEffect, useState } from "react";
import {
  DebugTableRow,
  DebugTableSummary,
  debugDbService,
} from "../services/debug-db-service";

export function useDebugDb() {
  const [tables, setTables] = useState<DebugTableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [rows, setRows] = useState<DebugTableRow[]>([]);
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
      setRows(await debugDbService.getRows(tableName));
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteRow = useCallback(
    async (id: string) => {
      if (!selectedTable) return;
      setLoading(true);
      try {
        await debugDbService.deleteRow(selectedTable, id);
        setRows(await debugDbService.getRows(selectedTable));
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
    loading,
    refreshTables,
    selectTable,
    clearSelection,
    deleteRow,
    resetDatabase,
    seedPeers,
    exportToJson,
    importFromJson,
  };
}
