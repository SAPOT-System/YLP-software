import { AUTH_ROUTES } from "@/app/routes";
import {
  AuthTextInput,
  PrimaryButton,
  SecondaryButton,
  useChangePassword,
} from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { useToast } from "@/features/shared/hooks";
import { router, useLocalSearchParams } from "expo-router";
import {
  deleteItemAsync,
  getItemAsync,
  setItemAsync,
} from "expo-secure-store";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  HelperText,
  Snackbar,
  Text,
} from "react-native-paper";

const ChangePasswordScreen = () => {
  const { token, identifier } = useLocalSearchParams<{
    token: string;
    identifier: string;
  }>();
  const [tokenValue, setTokenValue] = useState("");
  const [identifierValue, setIdentifierValue] = useState("");
  const changePasswordResult = useChangePassword(tokenValue);
  const {
    visible: toastVisible,
    message: toastMessage,
    showToast,
    hideToast,
  } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const normalizeParam = (value?: string | string[]) =>
      Array.isArray(value) ? value[0] ?? "" : value ?? "";

    const hydrateFromStorage = async () => {
      const tokenParam = normalizeParam(token);
      const identifierParam = normalizeParam(identifier);

      if (tokenParam) {
        setTokenValue(tokenParam);
        await setItemAsync("reset_password_token", tokenParam);
      } else {
        const storedToken = await getItemAsync("reset_password_token");
        if (storedToken) setTokenValue(storedToken);
      }

      if (identifierParam) {
        setIdentifierValue(identifierParam);
        await setItemAsync("reset_password_identifier", identifierParam);
      } else {
        const storedIdentifier = await getItemAsync(
          "reset_password_identifier"
        );
        if (storedIdentifier) setIdentifierValue(storedIdentifier);
      }
    };

    hydrateFromStorage();
  }, [token, identifier]);

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
    const res = await changePassword({
      password,
      confirmPassword,
      identifier: identifierValue,
    });
    if (res.success) {
      await deleteItemAsync("reset_password_token");
      await deleteItemAsync("reset_password_identifier");
      showToast("Change password successfully");
      router.replace(AUTH_ROUTES.FORGOT_PASSWORD.SUCCESS);
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
          <AuthTextInput
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

          <AuthTextInput
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
        <PrimaryButton
          onPress={handleChangePassword}
          loading={loading}
          disabled={loading}
        >
          Change
        </PrimaryButton>
        <SecondaryButton onPress={() => router.back()} disabled={loading}>
          Back
        </SecondaryButton>
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
