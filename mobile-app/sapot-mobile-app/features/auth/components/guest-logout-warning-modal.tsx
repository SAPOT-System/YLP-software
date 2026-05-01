import { SETTINGS_ROUTES } from "@/app/routes";
import { authLog } from "@/features/shared/utils/logger";
import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { Button, Dialog, Icon, Portal, Text, useTheme } from "react-native-paper";

interface GuestLogoutWarningModalProps {
  visible: boolean;
  onLogout: () => Promise<void>;
  onDismiss: () => void;
}

export const GuestLogoutWarningModal = ({
  visible,
  onLogout,
  onDismiss,
}: GuestLogoutWarningModalProps) => {
  const theme = useTheme();
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);

  const handleLogout = async () => {
    authLog.info("[GuestLogoutWarningModal] logout confirmed");
    setIsLoading(true);
    try {
      await onLogout();
    } catch (err) {
      authLog.error("[GuestLogoutWarningModal] logout failed", { error: err });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthenticate = () => {
    authLog.info("[GuestLogoutWarningModal] authenticate pressed");
    onDismiss();
    router.push(SETTINGS_ROUTES.AUTHENTICATE);
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={{
          backgroundColor: theme.colors.errorContainer,
          width: 350,
          marginHorizontal: "auto",
          borderColor: theme.colors.error,
          borderWidth: 1,
        }}
      >
        <Dialog.Title>
          <View style={{ flexDirection: "row" }}>
            <Icon
              source="alert-circle-outline"
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
              marginBottom: 8,
            }}
          >
            All Data Will Be Lost
          </Text>
          <Text
            variant="bodySmall"
            style={{
              color: theme.colors.onError,
              textAlign: "center",
            }}
          >
            As a guest user, all your local messages and conversations will be permanently deleted when you log out.{"\n\n"}
            Would you like to create an account to save your data?
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
              onPress={handleLogout}
              disabled={isLoading}
              style={{
                height: 40,
                minWidth: 90,
                flex: 1,
              }}
              labelStyle={{ fontSize: 12 }}
            >
              {isLoading ? "Logging out..." : "Logout"}
            </Button>
            <Button
              mode="contained"
              onPress={handleAuthenticate}
              disabled={isLoading}
              style={{
                height: 40,
                minWidth: 90,
                flex: 1,
              }}
              labelStyle={{ fontSize: 12 }}
            >
              Authenticate
            </Button>
          </View>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};
