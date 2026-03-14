import { AUTH_ROUTES } from "@/app/routes";
import { useEmailReset } from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { router, useLocalSearchParams } from "expo-router";
import { OTPInput } from "input-otp-native";
import React, { useState } from "react";
import { View } from "react-native";
import { HelperText, Text, useTheme } from "react-native-paper";

const CODE_LENGTH = 6;

const EnterRecoveryScreen = () => {
  const { identifier: email } = useLocalSearchParams<{ identifier: string }>();
  const { verifyCode, sendCode, error } = useEmailReset();
  const theme = useTheme();
  const [code, setCode] = useState<string>("");

  const handleOnChange = async (newCode: string) => {
    setCode(newCode);

    if (newCode.length === CODE_LENGTH) {
      const res = await verifyCode(email, newCode);

      if (res.success && res.recoveryLink) {
        const token = res.recoveryLink.split("token=")[1];

        router.push({
          pathname: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
          params: {
            token: token,
            identifier: email,
          },
        });
      }
    }
  };

  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Resetting Password" />
      <ScreenContent
        title="Enter Recovery Code"
        description="We've sent it on your email example@gmail.com"
      >
        <HelperText type="error">{error}</HelperText>
        <OTPInput
          value={code}
          onChange={handleOnChange}
          maxLength={CODE_LENGTH}
          autoFocus
          containerStyle={{
            marginVertical: 20,
            flexDirection: "row",
            justifyContent: "center",
          }}
          render={({ slots }) => (
            <>
              {slots.map((slot, index) => (
                <View
                  key={index}
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderColor: slot.isActive
                      ? theme.colors.primary
                      : theme.colors.outline,
                    borderWidth: slot.isActive ? 2 : 1,
                    borderRadius: 8,
                    width: 50,
                    height: 60,
                    marginHorizontal: 5,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.onSurface,
                      fontSize: 20,
                      fontWeight: "bold",
                    }}
                  >
                    {slot.char}
                  </Text>
                </View>
              ))}
            </>
          )}
        />
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onPrimaryContainer }}
        >
          The code will expire in {/* TODO: make a countdown */}
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onPrimaryContainer }}
        >
          Didn't receive code?{" "}
          <Text
            variant="bodyMedium"
            style={{
              fontWeight: "bold",
              color: theme.colors.onPrimaryContainer,
            }}
            onPress={() => sendCode(email)}
          >
            Resend
          </Text>
        </Text>
      </ScreenContent>
    </View>
  );
};

export default EnterRecoveryScreen;
