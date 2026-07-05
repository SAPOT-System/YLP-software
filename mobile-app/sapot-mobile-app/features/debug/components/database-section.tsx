import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { Button, IconButton, List, Text, useTheme } from "react-native-paper";
import { useDebugDb } from "../hooks/use-debug-db";

interface DatabaseSectionProps {
  onBack: () => void;
}

export function DatabaseSection({ onBack }: DatabaseSectionProps) {
  const theme = useTheme();
  const {
    tables,
    selectedTable,
    rows,
    loading,
    selectTable,
    clearSelection,
    deleteRow,
    resetDatabase,
    seedPeers,
    exportToJson,
  } = useDebugDb();
  const [exportedJson, setExportedJson] = useState<string | null>(null);

  const handleReset = () => {
    Alert.alert(
      "Reset local database?",
      "This permanently deletes every row in every table.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: () => resetDatabase() },
      ]
    );
  };

  const handleExport = async () => {
    setExportedJson(await exportToJson());
  };

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 4,
        }}
      >
        <IconButton
          icon="arrow-left"
          onPress={selectedTable ? clearSelection : onBack}
        />
        <Text variant="titleMedium">
          {selectedTable ? selectedTable : "Database"}
        </Text>
      </View>

      {loading && <Text>Loading…</Text>}

      {selectedTable ? (
        <ScrollView>
          {rows.length === 0 && <Text>No rows.</Text>}
          {rows.map((row) => (
            <List.Item
              key={row.id}
              title={row.id}
              description={JSON.stringify(row.fields)}
              onPress={() => deleteRow(row.id)}
            />
          ))}
        </ScrollView>
      ) : (
        <>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              paddingVertical: 8,
            }}
          >
            <Button mode="outlined" compact onPress={() => seedPeers()}>
              Seed peers
            </Button>
            <Button mode="outlined" compact onPress={handleReset}>
              Reset database
            </Button>
            <Button mode="outlined" compact onPress={handleExport}>
              Export JSON
            </Button>
          </View>

          {exportedJson !== null && (
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              {exportedJson}
            </Text>
          )}

          <ScrollView>
            {tables.map((table) => (
              <List.Item
                key={table.name}
                title={table.name}
                description={`${table.rowCount} rows`}
                onPress={() => selectTable(table.name)}
              />
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}
