import { View } from "react-native";
import React, { useState } from "react";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { Button, HelperText, TextInput } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { useValidateIdentifier } from "@/features/auth";

const EnterIdentifierScreen = () => {
  const {
    resetOption,
  }: { resetOption: "email" | "sms" | "question" | "recoveryKey" } =
    useLocalSearchParams();

  const { loading, error, validateIdentfier } = useValidateIdentifier();
  const [identifier, setIdentfier] = useState("");

  const handleContinue = async () => {
    const result = await validateIdentfier(identifier);

    if (result.success) {
      if (resetOption === "question")
        router.push({
          pathname: "/getting-started/question-reset",
          params: { identifier },
        });

      if (resetOption === "recoveryKey")
        router.push({
          pathname: "/getting-started/recovery-key-reset",
          params: { identifier },
        });
    }
  };
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Resetting Password" />
      <ScreenContent
        title="Password Recovery"
        description="Please enter your account"
      >
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 40 }}
        >
          <HelperText type="error">{error.general}</HelperText>
          <TextInput
            mode="outlined"
            label="Email/Phone number/Username"
            placeholder="Enter identifier"
            value={identifier}
            onChangeText={setIdentfier}
            error={!!error.identifier}
          />
          <HelperText type="error">{error.identifier}</HelperText>
        </View>
        <Button
          mode="contained"
          style={{ width: 280 }}
          onPress={handleContinue}
          loading={loading}
          disabled={loading}
        >
          Continue
        </Button>
      </ScreenContent>
    </View>
  );
};

export default EnterIdentifierScreen;
