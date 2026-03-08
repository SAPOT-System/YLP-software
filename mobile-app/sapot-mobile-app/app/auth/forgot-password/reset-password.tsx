import { StyleSheet, View } from "react-native";
import React, { useState } from "react";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import {
  ActivityIndicator,
  Button,
  HelperText,
  Snackbar,
  Text,
  TextInput,
} from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { useChangePassword } from "@/features/auth";
import { useToast } from "@/features/shared/hooks";
import { AUTH_ROUTES } from "@/app/routes";

const ChangePasswordScreen = () => {
  const { token, identifier } = useLocalSearchParams<{
    token: string;
    identifier: string;
  }>();
  const changePasswordResult = useChangePassword(token);
  const {
    visible: toastVisible,
    message: toastMessage,
    showToast,
    hideToast,
  } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  if (!changePasswordResult) {
    return <ActivityIndicator />;
  }

  const { changePassword, loading, errors, isTokenValid } =
    changePasswordResult;

  if (isTokenValid === null) {
    return <ActivityIndicator />;
  }
  if (isTokenValid === false) {
    return <Text>Invalid. Please retry.</Text>;
  }

  const handleChangePassword = async () => {
    const res = await changePassword({ password, confirmPassword, identifier });
    if (res.success) {
      showToast("Change password successfully");
      router.replace(AUTH_ROUTES.LOGIN.SERVER_LOGIN);
    } else {
      showToast("Change password failed");
    }
  };

  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Change Password" />
      <ScreenContent
        title="Change your password"
        description="Please enter your new password"
      >
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 40 }}
        >
          {/* TODO: implement error mechanism */}
          <TextInput
            mode="outlined"
            label="New password"
            placeholder="Enter your new password"
            value={password}
            onChangeText={setPassword}
            style={styles.textInput}
            secureTextEntry
            error={!!errors.password}
          />
          {errors.password && (
            <HelperText type="error" style={styles.helperText}>
              {errors.password}
            </HelperText>
          )}

          <TextInput
            mode="outlined"
            label="Confirm password"
            placeholder="Confirm your password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            style={styles.textInput}
            secureTextEntry
            error={!!errors.confirmPassword}
          />
          {errors.confirmPassword && (
            <HelperText type="error" style={styles.helperText}>
              {errors.confirmPassword}
            </HelperText>
          )}
        </View>
        <Button
          mode="contained"
          style={{ width: 280 }}
          onPress={handleChangePassword}
          loading={loading}
          disabled={loading}
        >
          Change
        </Button>
      </ScreenContent>
      <Snackbar visible={toastVisible} onDismiss={hideToast} duration={3000}>
        {toastMessage}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  textInput: {
    marginBottom: 4,
  },
  helperText: {
    marginBottom: 8,
  },
});
export default ChangePasswordScreen;
