import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import renderer from "react-test-renderer";
import { FailedDialog } from "../failed-dialog";

jest.mock("react-native-paper", () => {
  const { Pressable, Text, View } = require("react-native");

  const MockDialog = ({ visible, children, onDismiss }: { visible: boolean; children: React.ReactNode; onDismiss: () => void }) => {
    if (!visible) {
      return null;
    }

    return (
      <View accessibilityLabel="failed-dialog">
        <Pressable testID="dialog-dismiss" onPress={onDismiss}>
          <Text>dismiss</Text>
        </Pressable>
        {children}
      </View>
    );
  };

  const DialogTitle = ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
  const DialogContent = ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
  const DialogActions = ({ children }: { children: React.ReactNode }) => <View>{children}</View>;

  (MockDialog as unknown as { Title: typeof DialogTitle }).Title = DialogTitle;
  (MockDialog as unknown as { Content: typeof DialogContent }).Content = DialogContent;
  (MockDialog as unknown as { Actions: typeof DialogActions }).Actions = DialogActions;

  return {
    Button: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
    Dialog: MockDialog,
    Icon: ({ source }: { source: string }) => <View accessibilityLabel={`icon-${source}`} />,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    useTheme: () => ({
      colors: {
        errorContainer: "#fee",
        error: "#f00",
        onError: "#400",
      },
    }),
  };
});

describe("FailedDialog", () => {
  const hide = jest.fn();
  const onPrimaryBtnPress = jest.fn();
  const onSecondaryBtnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Unit tests", () => {
    it("renders connection failure copy and icon", () => {
      const { getByText, getByLabelText } = render(
        <FailedDialog
          type="connectionFailed"
          visible
          hide={hide}
          onPrimaryBtnPress={onPrimaryBtnPress}
          onSecondaryBtnPress={onSecondaryBtnPress}
        />
      );

      // Verifies correct computed content based on the `type` prop.
      expect(getByText("Unable to connect to server.")).toBeTruthy();
      expect(getByText("Try again")).toBeTruthy();
      expect(getByText("Use LAN mode")).toBeTruthy();
      expect(getByLabelText("icon-cloud-alert")).toBeTruthy();
    });

    it("renders upload failure copy for fileUploadFailed type", () => {
      const { getByText, getByLabelText } = render(
        <FailedDialog
          type="fileUploadFailed"
          visible
          hide={hide}
          onPrimaryBtnPress={onPrimaryBtnPress}
          onSecondaryBtnPress={onSecondaryBtnPress}
        />
      );

      expect(getByText("Invalid file type. Please upload a valid file.")).toBeTruthy();
      expect(getByText("Cancel")).toBeTruthy();
      expect(getByLabelText("icon-alert")).toBeTruthy();
    });

    it("does not render content when visible is false", () => {
      const { queryByText } = render(
        <FailedDialog
          type="connectionFailed"
          visible={false}
          hide={hide}
          onPrimaryBtnPress={onPrimaryBtnPress}
          onSecondaryBtnPress={onSecondaryBtnPress}
        />
      );

      // Edge case: hidden dialog should not expose actionable text.
      expect(queryByText("Try again")).toBeNull();
    });
  });

  describe("Integration tests", () => {
    it("fires parent handlers for primary, secondary, and dismiss interactions", () => {
      const { getByText, getByTestId } = render(
        <FailedDialog
          type="connectionFailed"
          visible
          hide={hide}
          onPrimaryBtnPress={onPrimaryBtnPress}
          onSecondaryBtnPress={onSecondaryBtnPress}
        />
      );

      fireEvent.press(getByText("Try again"));
      fireEvent.press(getByText("Use LAN mode"));
      fireEvent.press(getByTestId("dialog-dismiss"));

      expect(onPrimaryBtnPress).toHaveBeenCalledTimes(1);
      expect(onSecondaryBtnPress).toHaveBeenCalledTimes(1);
      expect(hide).toHaveBeenCalledTimes(1);
    });
  });

  describe("Snapshot tests", () => {
    it("matches snapshot for a visible connectionFailed dialog", () => {
      const tree = renderer
        .create(
          <FailedDialog
            type="connectionFailed"
            visible
            hide={hide}
            onPrimaryBtnPress={onPrimaryBtnPress}
            onSecondaryBtnPress={onSecondaryBtnPress}
          />
        )
        .toJSON();

      expect(tree).toMatchSnapshot();
    });
  });
});
