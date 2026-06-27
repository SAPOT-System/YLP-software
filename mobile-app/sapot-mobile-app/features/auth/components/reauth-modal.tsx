import { reauthenticateApi } from "@/features/auth/api/auth.api";
import { SettingsTextInput } from "@/features/settings";
import { uiLog } from "@/features/shared/core/utils/logger";
import { isAxiosError } from "axios";
import { useState } from "react";
import { View } from "react-native";
import {
  Button,
  HelperText,
  Modal,
  Portal,
  Text,
  useTheme,
} from "react-native-paper";

interface ReauthModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSuccess: (reauthToken: string) => void;
}

export function ReauthModal({ visible, onDismiss, onSuccess }: ReauthModalProps) {
  const theme = useTheme();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    if (!password.trim()) {
      setError("Password is required");
      return;
    }
    setError(undefined);
    setIsLoading(true);
    try {
      const { reauth_token } = await reauthenticateApi(password);
      setPassword("");
      onSuccess(reauth_token);
    } catch (err) {
      uiLog.error("[ReauthModal] reauthentication failed", { error: err });
      if (isAxiosError(err) && err.response?.status === 401) {
        setError("Incorrect password.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setPassword("");
    setError(undefined);
    onDismiss();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleDismiss}
        contentContainerStyle={{
          backgroundColor: theme.colors.background,
          padding: 24,
          margin: 20,
          borderRadius: 12,
        }}
      >
        <Text variant="titleMedium" style={{ marginBottom: 8 }}>
          Confirm Your Password
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}
        >
          For your security, please enter your password to continue.
        </Text>
        <SettingsTextInput
          label="Current Password"
          placeholder="Enter your password"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (error) setError(undefined);
          }}
          secureTextEntry
          error={Boolean(error)}
        />
        {error && (
          <HelperText type="error" visible>
            {error}
          </HelperText>
        )}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 16,
          }}
        >
          <Button onPress={handleDismiss} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handleConfirm}
            loading={isLoading}
            disabled={isLoading}
          >
            Confirm
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}
