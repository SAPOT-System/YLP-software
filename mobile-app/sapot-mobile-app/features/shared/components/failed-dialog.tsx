import React from "react";
import { View } from "react-native";
import {
    Button,
    Dialog,
    Icon,
    Portal,
    Text,
    useTheme,
} from "react-native-paper";
import { uiLog } from "../core/utils/logger";
uiLog.debug("[failed-dialog] module loaded");

const failedOption = {
  connectionFailed: {
    icon: "cloud-alert",
    body: "Unable to connect to server.",
    primaryBtnText: "Try again",
    secondaryBtnText: "Use LAN mode",
  },
  fileUploadFailed: {
    icon: "alert",
    body: "Invalid file type. Please upload a valid file.",
    primaryBtnText: "Try again",
    secondaryBtnText: "Cancel",
  },
};
interface FailedDialogProps {
  visible: boolean;
  hide: () => void;
  onPrimaryBtnPress: () => void;
  onSecondaryBtnPress: () => void;
  type: keyof typeof failedOption;
}

export const FailedDialog = ({
  type,
  visible,
  hide,
  onPrimaryBtnPress,
  onSecondaryBtnPress,
}: FailedDialogProps) => {
  const theme = useTheme();
  const handlePrimary = () => {
    uiLog.info("failed-dialog › primary", { type });
    onPrimaryBtnPress();
  };
  const handleSecondary = () => {
    uiLog.info("failed-dialog › secondary", { type });
    onSecondaryBtnPress();
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={hide}
        style={{
          backgroundColor: theme.colors.errorContainer,
          width: 350,
          marginHorizontal: "auto",
          borderColor: "red",
          borderWidth: 1,
        }}
      >
        <Dialog.Title>
          <View style={{ flexDirection: "row" }}>
            <Icon
              source={failedOption[type].icon}
              size={40}
              color={theme.colors.error}
            />
          </View>
        </Dialog.Title>
        <Dialog.Content>
          <Text
            variant="headlineSmall"
            style={{
              color: theme.colors.onError,
              fontWeight: "bold",
              textAlign: "center",
            }}
          >
            {failedOption[type].body}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 4,
              width: "100%",
            }}
          >
            <Button
              mode="outlined"
              onPress={handleSecondary}
              style={{
                height: 40,
                minWidth: 90,
                // paddingHorizontal: 4,
                flex: 1,
              }}
              labelStyle={{ fontSize: 12 }}
            >
              {failedOption[type].secondaryBtnText}
            </Button>
            <Button
              mode="contained"
              onPress={handlePrimary}
              style={{
                height: 40,
                minWidth: 90,
                flex: 1,
                // marginLeft: 8,
              }}
              labelStyle={{ fontSize: 12 }}
            >
              {failedOption[type].primaryBtnText}
            </Button>
          </View>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};
