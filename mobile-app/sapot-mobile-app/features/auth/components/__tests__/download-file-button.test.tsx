import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";
import DownloadFileButton from "../download-file-button";

type SaveDocumentsArgs = {
  sourceUris: string[];
  copy: boolean;
  mimeType: string;
  fileName: string;
};

type SaveDocumentsResult = Array<{ uri?: string | null }>;

const mockSaveDocuments = jest.fn<
  Promise<SaveDocumentsResult>,
  [SaveDocumentsArgs]
>();
const mockWrite = jest.fn<Promise<void>, [string, { encoding: string }]>();
const mockFileCtor = jest.fn<void, [string, string]>();
const mockReplace = jest.fn<void, [string]>();

jest.mock("@react-native-documents/picker", () => ({
  saveDocuments: (args: SaveDocumentsArgs) => mockSaveDocuments(args),
}));

jest.mock("expo-router", () => ({
  router: {
    replace: (path: string) => mockReplace(path),
  },
}));

jest.mock("expo-file-system", () => {
  class MockFile {
    uri: string;
    write = mockWrite;

    constructor(directory: string, fileName: string) {
      this.uri = `${directory}/${fileName}`;
      mockFileCtor(directory, fileName);
    }
  }

  return {
    Paths: { document: "/documents" },
    File: MockFile,
  };
});

jest.mock("react-native-paper", () => {
  const { Pressable, Text } = require("react-native");

  return {
    Button: ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children: React.ReactNode;
      onPress: () => void;
      accessibilityLabel?: string;
    }) => (
      <Pressable onPress={onPress} accessibilityLabel={accessibilityLabel}>
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});

describe("DownloadFileButton", () => {
  let alertSpy: jest.SpyInstance<void, Parameters<typeof Alert.alert>>;

  beforeEach(() => {
    mockSaveDocuments.mockReset();
    mockWrite.mockReset();
    mockFileCtor.mockClear();
    mockReplace.mockClear();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  describe("Unit tests", () => {
    it("writes the file and routes to tabs when save location is selected", async () => {
      mockWrite.mockResolvedValueOnce(undefined);
      mockSaveDocuments.mockResolvedValueOnce([
        { uri: "file:///target/recovery-key.txt" },
      ]);

      const { getByLabelText } = render(
        <DownloadFileButton fileData="secure-content" />
      );

      fireEvent.press(getByLabelText("Download recovery key file"));

      await waitFor(() => {
        // Verifies successful write + picker + navigation flow.
        expect(mockFileCtor).toHaveBeenCalledWith(
          "/documents",
          "recovery-key.txt"
        );
        expect(mockWrite).toHaveBeenCalledWith("secure-content", {
          encoding: "utf8",
        });
        expect(mockSaveDocuments).toHaveBeenCalledWith({
          sourceUris: ["/documents/recovery-key.txt"],
          copy: false,
          mimeType: "text/plain",
          fileName: "recovery-key.txt",
        });
        expect(Alert.alert).toHaveBeenCalledWith("File saved");
        expect(mockReplace).toHaveBeenCalledWith("/(drawer)/(tabs)");
      });
    });

    it("shows cancellation alert when no target location is selected", async () => {
      mockWrite.mockResolvedValueOnce(undefined);
      mockSaveDocuments.mockResolvedValueOnce([{}]);

      const { getByText } = render(<DownloadFileButton fileData="abc" />);

      fireEvent.press(getByText("Download"));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          "Save cancelled",
          "No location selected."
        );
      });
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it("shows the error message when write/save fails", async () => {
      mockWrite.mockRejectedValueOnce(new Error("Disk full"));

      const { getByText } = render(<DownloadFileButton fileData="abc" />);

      fireEvent.press(getByText("Download"));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          "Download failed",
          "Disk full"
        );
      });
      expect(mockSaveDocuments).not.toHaveBeenCalled();
    });

    it("falls back to Unknown error when rejection has no message", async () => {
      mockWrite.mockRejectedValueOnce({});

      const { getByText } = render(<DownloadFileButton fileData="abc" />);

      fireEvent.press(getByText("Download"));

      await waitFor(() => {
        // Edge case: non-Error throw values should still produce user feedback.
        expect(Alert.alert).toHaveBeenCalledWith(
          "Download failed",
          "Unknown error"
        );
      });
    });
  });

  describe("Integration tests", () => {
    type MockNavigation = {
      navigate: jest.MockedFunction<(screen: string) => void>;
      goBack: jest.MockedFunction<() => void>;
    };

    const Parent = () => (
      <DownloadFileButton
        fileData="integrated-data"
        fileName="custom-name.txt"
      />
    );

    it("uses custom filename through the full IO flow in a parent render", async () => {
      const navigation: MockNavigation = {
        navigate: jest.fn<void, [string]>(),
        goBack: jest.fn<void, []>(),
      };

      mockWrite.mockResolvedValueOnce(undefined);
      mockSaveDocuments.mockResolvedValueOnce([
        { uri: "file:///target/custom-name.txt" },
      ]);

      const { getByText } = render(<Parent />);
      fireEvent.press(getByText("Download"));

      await waitFor(() => {
        expect(mockFileCtor).toHaveBeenCalledWith(
          "/documents",
          "custom-name.txt"
        );
        expect(mockSaveDocuments).toHaveBeenCalledWith({
          sourceUris: ["/documents/custom-name.txt"],
          copy: false,
          mimeType: "text/plain",
          fileName: "custom-name.txt",
        });
      });

      expect(navigation.navigate).not.toHaveBeenCalled();
      expect(navigation.goBack).not.toHaveBeenCalled();
    });
  });
});
