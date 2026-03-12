import { View } from "react-native";
import React, { useState } from "react";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { HelperText } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import {
  AuthTextInput,
  PrimaryButton,
  SecondaryButton,
  useEmailReset,
  useValidateIdentifier,
} from "@/features/auth";
import { AUTH_ROUTES } from "@/app/routes";

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

  const handleContinue = async () => {
    const result = await validateIdentfier(identifier);

    if (result.success) {
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
