import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Button, DataTable, IconButton, List, Text } from "react-native-paper";
import { useDebugDb } from "../hooks/use-debug-db";

const ID_COLUMN_WIDTH = 160;
const DATA_COLUMN_WIDTH = 140;
const ACTIONS_COLUMN_WIDTH = 64;
const ID_CELL_MAX_CHARS = 20;
const DATA_CELL_MAX_CHARS = 18;

function truncateCellValue(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

interface DatabaseSectionProps {
  onBack: () => void;
}

export function DatabaseSection({ onBack }: DatabaseSectionProps) {
  const {
    tables,
    selectedTable,
    rows,
    columns,
    hasMore,
    loading,
    selectTable,
    loadMoreRows,
    clearSelection,
    deleteRow,
    resetDatabase,
    seedPeers,
  } = useDebugDb();

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
        rows.length === 0 ? (
          <Text>No rows.</Text>
        ) : (
          <ScrollView horizontal>
            <View>
              <DataTable.Header>
                <DataTable.Title style={styles.idColumn}>id</DataTable.Title>
                {columns.map((column) => (
                  <DataTable.Title key={column} style={styles.dataColumn}>
                    {column}
                  </DataTable.Title>
                ))}
                <DataTable.Title style={styles.actionsColumn}>
                  Actions
                </DataTable.Title>
              </DataTable.Header>

              <ScrollView>
                {rows.map((row) => (
                  <DataTable.Row key={row.id}>
                    <DataTable.Cell style={styles.idColumn}>
                      {truncateCellValue(row.id, ID_CELL_MAX_CHARS)}
                    </DataTable.Cell>
                    {columns.map((column) => (
                      <DataTable.Cell key={column} style={styles.dataColumn}>
                        {truncateCellValue(
                          String(row.fields[column] ?? ""),
                          DATA_CELL_MAX_CHARS
                        )}
                      </DataTable.Cell>
                    ))}
                    <DataTable.Cell style={styles.actionsColumn}>
                      <IconButton
                        icon="delete"
                        onPress={() => deleteRow(row.id)}
                      />
                    </DataTable.Cell>
                  </DataTable.Row>
                ))}
                {hasMore && (
                  <Button
                    mode="text"
                    loading={loading}
                    disabled={loading}
                    onPress={loadMoreRows}
                  >
                    Load more
                  </Button>
                )}
              </ScrollView>
            </View>
          </ScrollView>
        )
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
          </View>

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

const styles = StyleSheet.create({
  idColumn: {
    flex: 0,
    width: ID_COLUMN_WIDTH,
  },
  dataColumn: {
    flex: 0,
    width: DATA_COLUMN_WIDTH,
  },
  actionsColumn: {
    flex: 0,
    width: ACTIONS_COLUMN_WIDTH,
  },
});
