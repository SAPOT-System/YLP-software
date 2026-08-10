import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { DatabaseSection } from "../database-section";
import { useDebugDb } from "../../hooks/use-debug-db";

jest.mock("../../hooks/use-debug-db");

jest.mock("react-native-paper", () => {
  const { Pressable, Text: RNText, View: RNView } = require("react-native");

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

  const PassthroughView = ({ children }: { children?: React.ReactNode }) => (
    <RNView>{children}</RNView>
  );
  const PassthroughText = ({ children }: { children?: React.ReactNode }) => (
    <RNText>{children}</RNText>
  );

  const MockDataTable = Object.assign(PassthroughView, {
    Header: PassthroughView,
    Title: PassthroughText,
    Row: PassthroughView,
    Cell: PassthroughText,
  });

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
    IconButton: ({
      icon,
      onPress,
    }: {
      icon: string;
      onPress: () => void;
    }) => (
      <Pressable
        testID={icon === "arrow-left" ? "back-button" : `icon-${icon}`}
        onPress={onPress}
      >
        <RNText>{icon}</RNText>
      </Pressable>
    ),
    DataTable: MockDataTable,
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
  columns: [] as string[],
  hasMore: false,
  loading: false,
  selectTable: jest.fn(),
  loadMoreRows: jest.fn(),
  clearSelection: jest.fn(),
  deleteRow: jest.fn(),
  resetDatabase: jest.fn(),
  seedPeers: jest.fn(),
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

  it("shows a table with only schema columns, excluding raw internals", () => {
    mockedUseDebugDb.mockReturnValue({
      ...baseHookValue,
      selectedTable: "peers",
      columns: ["username"],
      rows: [
        {
          id: "peer-1",
          fields: { id: "peer-1", username: "alice", _status: "created", _changed: "" },
        },
      ],
    });

    const { getByText, queryByText } = render(<DatabaseSection onBack={jest.fn()} />);

    expect(getByText("id")).toBeTruthy();
    expect(getByText("username")).toBeTruthy();
    expect(getByText("peer-1")).toBeTruthy();
    expect(getByText("alice")).toBeTruthy();
    expect(queryByText("_status")).toBeNull();
    expect(queryByText("created")).toBeNull();
  });

  it("truncates cell values past the length threshold with an ellipsis", () => {
    const longId = "peer-id-that-is-way-too-long-for-a-cell";
    const longUsername = "a-username-that-is-far-too-long-to-fit-in-a-column";
    mockedUseDebugDb.mockReturnValue({
      ...baseHookValue,
      selectedTable: "peers",
      columns: ["username"],
      rows: [
        {
          id: longId,
          fields: { id: longId, username: longUsername },
        },
      ],
    });

    const { getByText, queryByText } = render(<DatabaseSection onBack={jest.fn()} />);

    expect(queryByText(longId)).toBeNull();
    expect(queryByText(longUsername)).toBeNull();
    expect(getByText(`${longId.slice(0, 17)}...`)).toBeTruthy();
    expect(getByText(`${longUsername.slice(0, 15)}...`)).toBeTruthy();
  });

  it("does not truncate cell values under the length threshold", () => {
    mockedUseDebugDb.mockReturnValue({
      ...baseHookValue,
      selectedTable: "peers",
      columns: ["username"],
      rows: [{ id: "peer-1", fields: { id: "peer-1", username: "alice" } }],
    });

    const { getByText } = render(<DatabaseSection onBack={jest.fn()} />);

    expect(getByText("peer-1")).toBeTruthy();
    expect(getByText("alice")).toBeTruthy();
  });

  it("deletes the row when its delete icon is pressed", () => {
    mockedUseDebugDb.mockReturnValue({
      ...baseHookValue,
      selectedTable: "peers",
      columns: ["username"],
      rows: [{ id: "peer-1", fields: { id: "peer-1", username: "alice" } }],
    });

    const { getByTestId } = render(<DatabaseSection onBack={jest.fn()} />);

    fireEvent.press(getByTestId("icon-delete"));

    expect(baseHookValue.deleteRow).toHaveBeenCalledWith("peer-1");
  });

  it("shows a Load more button when hasMore is true, and it calls loadMoreRows", () => {
    mockedUseDebugDb.mockReturnValue({
      ...baseHookValue,
      selectedTable: "peers",
      columns: ["username"],
      hasMore: true,
      rows: [{ id: "peer-1", fields: { id: "peer-1", username: "alice" } }],
    });

    const { getByText, queryByText } = render(<DatabaseSection onBack={jest.fn()} />);

    expect(queryByText("Load more")).toBeTruthy();
    fireEvent.press(getByText("Load more"));
    expect(baseHookValue.loadMoreRows).toHaveBeenCalled();
  });

  it("hides the Load more button when hasMore is false", () => {
    mockedUseDebugDb.mockReturnValue({
      ...baseHookValue,
      selectedTable: "peers",
      columns: ["username"],
      hasMore: false,
      rows: [{ id: "peer-1", fields: { id: "peer-1", username: "alice" } }],
    });

    const { queryByText } = render(<DatabaseSection onBack={jest.fn()} />);

    expect(queryByText("Load more")).toBeNull();
  });

  it("shows a message instead of a table when there are no rows", () => {
    mockedUseDebugDb.mockReturnValue({
      ...baseHookValue,
      selectedTable: "peers",
      columns: ["username"],
      rows: [],
    });

    const { getByText } = render(<DatabaseSection onBack={jest.fn()} />);

    expect(getByText("No rows.")).toBeTruthy();
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
});
