import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import renderer from "react-test-renderer";
import RecoveryKeyDownloadModal from "../recovery-key-download-modal";

jest.mock("../download-file-button", () => {
  const { Text } = require("react-native");

  return ({ fileData }: { fileData: string }) => <Text>Download payload: {fileData}</Text>;
});

jest.mock("react-native-paper", () => {
  const { Pressable, Text, View } = require("react-native");

  const Modal = ({ visible, onDismiss, children }: { visible: boolean; onDismiss: () => void; children: React.ReactNode }) => {
    if (!visible) {
      return null;
    }

    return (
      <View>
        <Pressable testID="dismiss-modal" onPress={onDismiss}>
          <Text>dismiss</Text>
        </Pressable>
        {children}
      </View>
    );
  };

  return {
    Modal,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    useTheme: () => ({
      colors: {
        background: "#fff",
        inverseOnSurface: "#111",
        secondary: "#ddd",
        onSecondary: "#333",
      },
    }),
  };
});

describe("RecoveryKeyDownloadModal", () => {
  const hideModal = jest.fn<void, []>();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Unit tests", () => {
    it("renders key messaging and file placeholder when visible", () => {
      const { getByText } = render(
        <RecoveryKeyDownloadModal visible fileData="abc-123" hideModal={hideModal} />
      );

      // Verifies static copy and child composition for modal content.
      expect(getByText("Recovery Key")).toBeTruthy();
      expect(getByText("Your recovery key")).toBeTruthy();
      expect(getByText("recovery-file.txt")).toBeTruthy();
      expect(getByText("Download payload: abc-123")).toBeTruthy();
    });

    it("does not render content when visible is false", () => {
      const { queryByText } = render(
        <RecoveryKeyDownloadModal visible={false} fileData="abc-123" hideModal={hideModal} />
      );

      // Edge case: hidden modal should not expose text/actions.
      expect(queryByText("Recovery Key")).toBeNull();
    });
  });

  describe("Integration tests", () => {
    it("calls hideModal when modal dismiss is triggered", () => {
      const { getByTestId } = render(
        <RecoveryKeyDownloadModal visible fileData="abc-123" hideModal={hideModal} />
      );

      fireEvent.press(getByTestId("dismiss-modal"));

      expect(hideModal).toHaveBeenCalledTimes(1);
    });
  });

  describe("Snapshot tests", () => {
    it("matches snapshot for visible modal", () => {
      const tree = renderer
        .create(<RecoveryKeyDownloadModal visible fileData="abc-123" hideModal={hideModal} />)
        .toJSON();

      expect(tree).toMatchSnapshot();
    });
  });
});
