import { AUTH_ROUTES } from "@/app/routes";
import {
  AuthTextInput,
  PrimaryButton,
  SecondaryButton,
  useEmailReset,
  useValidateIdentifier,
} from "@/features/auth";
import { canResetPasswordApi } from "@/features/auth/api/auth.api";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { router, useLocalSearchParams } from "expo-router";
import { deleteItemAsync, getItemAsync } from "expo-secure-store";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { HelperText } from "react-native-paper";

const EnterIdentifierScreen = () => {
  const {
    resetOption,
  }: { resetOption: "email" | "sms" | "question" | "recoveryKey" } =
    useLocalSearchParams();

  const { loading, error, validateIdentfier } = useValidateIdentifier();
  const {
    isLoading: emailResetLoading,
    error: emailResetError,
    sendCode,
  } = useEmailReset();
  const [identifier, setIdentfier] = useState("");
  const [storedToken, setStoredToken] = useState<string | null>(null);
  const [storedIdentifier, setStoredIdentifier] =
    useState<string | null>(null);
  const [hasCheckedStoredToken, setHasCheckedStoredToken] = useState(false);

  useEffect(() => {
    const loadStoredReset = async () => {
      try {
        const tokenValue = await getItemAsync("reset_password_token");
        const identifierValue = await getItemAsync(
          "reset_password_identifier"
        );
        setStoredToken(tokenValue);
        setStoredIdentifier(identifierValue);
      } catch {
        setStoredToken(null);
        setStoredIdentifier(null);
      } finally {
        setHasCheckedStoredToken(false);
      }
    };

    loadStoredReset();
  }, []);

  const handleContinue = async () => {
    const result = await validateIdentfier(identifier);

    if (result.success) {
      if (
        !hasCheckedStoredToken &&
        storedToken &&
        storedIdentifier &&
        identifier === storedIdentifier
      ) {
        setHasCheckedStoredToken(true);

        try {
          const isValid = await canResetPasswordApi(storedToken);

          if (isValid) {
            router.replace({
              pathname: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
              params: { token: storedToken, identifier: storedIdentifier },
            });
            return;
          }

          await deleteItemAsync("reset_password_token");
          await deleteItemAsync("reset_password_identifier");
          setStoredToken(null);
          setStoredIdentifier(null);
        } catch {
          await deleteItemAsync("reset_password_token");
          await deleteItemAsync("reset_password_identifier");
          setStoredToken(null);
          setStoredIdentifier(null);
        }
      }

      if (resetOption === "question")
        router.push({
          pathname: AUTH_ROUTES.FORGOT_PASSWORD.QUESTION_RESET,
          params: { identifier },
        });

      if (resetOption === "recoveryKey")
        router.push({
          pathname: AUTH_ROUTES.FORGOT_PASSWORD.RECOVERY_KEY_RESET,
          params: { identifier },
        });

      if (resetOption === "email") {
        const res = await sendCode(identifier);
        if (res.success) {
          router.push({
            pathname: AUTH_ROUTES.FORGOT_PASSWORD.ENTER_RECOVERY,
            params: { identifier },
          });
        }
      }
    }
  };
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Resetting Password" />
      <ScreenContent
        title="Forgot Password"
        description="Enter your account details"
      >
        <View style={{ width: "100%", alignItems: "stretch" }}>
          <HelperText type="error">
            {error.general || emailResetError}
          </HelperText>
          <AuthTextInput
            label="Email/Phone number/Username"
            placeholder="Enter identifier"
            value={identifier}
            onChangeText={setIdentfier}
            error={!!error.identifier}
          />
          <HelperText type="error">{error.identifier}</HelperText>
        </View>
        <PrimaryButton
          style={{ marginBottom: 8 }}
          onPress={handleContinue}
          loading={loading || emailResetLoading}
          disabled={loading || emailResetLoading}
        >
          Continue
        </PrimaryButton>
        <SecondaryButton
          onPress={() => router.back()}
          disabled={loading || emailResetLoading}
        >
          Back
        </SecondaryButton>
      </ScreenContent>
    </View>
  );
};

export default EnterIdentifierScreen;
