import { View } from "react-native";
import React, { useState } from "react";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { Button, TextInput } from "react-native-paper";
import { router } from "expo-router";
import { AUTH_ROUTES } from "@/app/routes";

const EmailResetScreen = () => {
  const [email, setEmail] = useState("");
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Resetting Password" />
      <ScreenContent
        title="Password Recovery"
        description="We will send a password recovery code to this email address"
      >
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 40 }}
        >
          {/* TODO: implement error mechanism */}
          <TextInput
            mode="outlined"
            label="Email Address"
            placeholder="yourmail@gmail.com"
            value={email}
            onChangeText={setEmail}
          />
        </View>
        <Button
          mode="contained"
          style={{ width: 280 }}
          onPress={() =>
            router.push(AUTH_ROUTES.FORGOT_PASSWORD.ENTER_RECOVERY)
          }
        >
          Send Code
        </Button>
      </ScreenContent>
    </View>
  );
};

export default EmailResetScreen;
