import { AUTH_ROUTES } from "@/config/routes";
import { useEmailReset } from "@/features/auth";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { authLog } from "@/features/shared/utils/logger";
import { router, useLocalSearchParams } from "expo-router";
import { OTPInput } from "input-otp-native";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { HelperText, Text, useTheme } from "react-native-paper";

const CODE_LENGTH = 6;
const COUNTDOWN_SECONDS = 5 * 60;

const EnterRecoveryScreen = () => {
  const { identifier: email } = useLocalSearchParams<{ identifier: string }>();
  const { verifyCode, sendCode, error } = useEmailReset();
  const theme = useTheme();
  const [code, setCode] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState<number>(COUNTDOWN_SECONDS);

  useEffect(() => {
    authLog.info("[EnterRecoveryScreen] mounted");
    return () => {
      authLog.info("[EnterRecoveryScreen] unmounted");
    };
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }

    const timerId = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timerId);
  }, [secondsLeft]);

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleResend = () => {
    authLog.debug("[EnterRecoveryScreen] handleResend called");
    sendCode(email);
    setSecondsLeft(COUNTDOWN_SECONDS);
  };

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
        description={`We've sent it on your email ${email}`}
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
                    width: 44,
                    height: 56,
                    marginHorizontal: 4,
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
        <View style={{ alignItems: "center", gap: 6, marginTop: 8 }}>
          <Text
            variant="bodySmall"
            style={{
              color:
                secondsLeft <= 60
                  ? theme.colors.error
                  : theme.colors.onSurfaceVariant,
              fontWeight: secondsLeft <= 60 ? "bold" : "normal",
            }}
          >
            Code expires in{" "}
            <Text variant="bodySmall" style={{ fontWeight: "bold" }}>
              {formatTime(secondsLeft)}
            </Text>
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            Didn't receive a code?{" "}
            <Text
              variant="labelLarge"
              style={{
                color:
                  secondsLeft === 0
                    ? theme.colors.primary
                    : theme.colors.outline,
                textDecorationLine: secondsLeft === 0 ? "underline" : "none",
              }}
              onPress={secondsLeft === 0 ? handleResend : undefined}
            >
              Resend
            </Text>
          </Text>
        </View>
      </ScreenContent>
    </View>
  );
};

export default EnterRecoveryScreen;
