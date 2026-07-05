import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { DatabaseSection } from "../database-section";
import { useDebugDb } from "../../hooks/use-debug-db";

jest.mock("../../hooks/use-debug-db");

jest.mock("react-native-paper", () => {
  const { Pressable, Text: RNText } = require("react-native");

  const MockList = ({
    title,
    description,
    onPress,
  }: {
    title: string;
    description?: string;
    onPress: () => void;
  }) => (
    <Pressable onPress={onPress}>
      <RNText>{title}</RNText>
      {description ? <RNText>{description}</RNText> : null}
    </Pressable>
  );
  (MockList as unknown as { Item: typeof MockList }).Item = MockList;

  return {
    Button: ({
      children,
      onPress,
    }: {
      children: React.ReactNode;
      onPress: () => void;
    }) => (
      <Pressable onPress={onPress}>
        <RNText>{children}</RNText>
      </Pressable>
    ),
    IconButton: ({ onPress }: { onPress: () => void }) => (
      <Pressable testID="back-button" onPress={onPress}>
        <RNText>back</RNText>
      </Pressable>
    ),
    List: MockList,
    Text: RNText,
    useTheme: () => ({ colors: { onSurfaceVariant: "#888" } }),
  };
});

const mockedUseDebugDb = useDebugDb as jest.Mock;

const baseHookValue = {
  tables: [{ name: "peers", rowCount: 2 }],
  selectedTable: null as string | null,
  rows: [] as { id: string; fields: Record<string, unknown> }[],
  loading: false,
  selectTable: jest.fn(),
  clearSelection: jest.fn(),
  deleteRow: jest.fn(),
  resetDatabase: jest.fn(),
  seedPeers: jest.fn(),
  exportToJson: jest.fn().mockResolvedValue("{}"),
  importFromJson: jest.fn(),
};

describe("DatabaseSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseDebugDb.mockReturnValue({ ...baseHookValue });
  });

  it("lists tables with row counts", () => {
    const { getByText } = render(<DatabaseSection onBack={jest.fn()} />);

    expect(getByText("peers")).toBeTruthy();
    expect(getByText("2 rows")).toBeTruthy();
  });

  it("selecting a table calls selectTable", () => {
    const { getByText } = render(<DatabaseSection onBack={jest.fn()} />);

    fireEvent.press(getByText("peers"));

    expect(baseHookValue.selectTable).toHaveBeenCalledWith("peers");
  });

  it("shows rows for the selected table and deletes on press", () => {
    mockedUseDebugDb.mockReturnValue({
      ...baseHookValue,
      selectedTable: "peers",
      rows: [{ id: "peer-1", fields: { username: "alice" } }],
    });

    const { getByText } = render(<DatabaseSection onBack={jest.fn()} />);

    expect(getByText("peer-1")).toBeTruthy();
    fireEvent.press(getByText("peer-1"));
    expect(baseHookValue.deleteRow).toHaveBeenCalledWith("peer-1");
  });

  it("back button clears table selection instead of exiting the section", () => {
    mockedUseDebugDb.mockReturnValue({
      ...baseHookValue,
      selectedTable: "peers",
      rows: [],
    });
    const onBack = jest.fn();

    const { getByTestId } = render(<DatabaseSection onBack={onBack} />);
    fireEvent.press(getByTestId("back-button"));

    expect(baseHookValue.clearSelection).toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("back button exits the section when no table is selected", () => {
    const onBack = jest.fn();
    const { getByTestId } = render(<DatabaseSection onBack={onBack} />);

    fireEvent.press(getByTestId("back-button"));

    expect(onBack).toHaveBeenCalled();
    expect(baseHookValue.clearSelection).not.toHaveBeenCalled();
  });

  it("seed peers button calls seedPeers", () => {
    const { getByText } = render(<DatabaseSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Seed peers"));

    expect(baseHookValue.seedPeers).toHaveBeenCalled();
  });

  it("export button displays the exported JSON", async () => {
    const { getByText, findByText } = render(<DatabaseSection onBack={jest.fn()} />);

    fireEvent.press(getByText("Export JSON"));

    expect(await findByText("{}")).toBeTruthy();
    expect(baseHookValue.exportToJson).toHaveBeenCalled();
  });
});
