import { OTPInput } from "input-otp-native";
import { useEffect, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import {
  HelperText,
  Text,
  useTheme,
} from "react-native-paper";
import { LoadingSpinner } from "@/features/shared/components/loading-spinner";
import { Crossfade } from "@/features/shared/components/crossfade";

const CODE_LENGTH = 6;
const OTP_TTL_SECONDS = 300;
const RESEND_COOLDOWN = 60;

interface VerificationCodeContentProps {
  email?: string;
  phone?: string;
  error?: string;
  onVerifyCode: (code: string) => Promise<void> | void;
  onResendCode?: () => Promise<void> | void;
}

const VerificationCodeContent = ({
  email,
  phone,
  error,
  onVerifyCode,
  onResendCode,
}: VerificationCodeContentProps) => {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width - 32, 420);
  const slotGap = 8;
  const slotWidth = Math.max(
    36,
    Math.floor((contentWidth - 40 - slotGap * (CODE_LENGTH - 1)) / CODE_LENGTH)
  );
  const slotHeight = Math.max(48, Math.floor(slotWidth * 1.2));
  const [code, setCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL_SECONDS);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [resendConfirmed, setResendConfirmed] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) {
          clearInterval(id);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  useEffect(() => {
    if (error) setCode("");
  }, [error]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const cooldownMm = String(Math.floor(resendCooldown / 60)).padStart(2, "0");
  const cooldownSs = String(resendCooldown % 60).padStart(2, "0");

  const handleOnChange = async (newCode: string) => {
    if (isVerifying) return;
    setCode(newCode);
    if (newCode.length === CODE_LENGTH) {
      setIsVerifying(true);
      try {
        await onVerifyCode(newCode);
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await onResendCode?.();
      setSecondsLeft(OTP_TTL_SECONDS);
      setResendCooldown(RESEND_COOLDOWN);
      setResendConfirmed(true);
      setTimeout(() => setResendConfirmed(false), 3000);
    } catch {
      // error surfaces via parent's onResendCode error handling
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 24,
        alignItems: "center",
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        variant="titleMedium"
        style={{ fontWeight: "bold", textAlign: "center" }}
      >
        Enter Verification Code
      </Text>
      <Text
        variant="bodySmall"
        style={{
          color: theme.colors.onPrimaryContainer,
          marginTop: 4,
          textAlign: "center",
        }}
      >
        {email
          ? `We've sent it to your email ${email}`
          : phone
          ? `We've sent it to your phone ${phone}`
          : "We've sent a code"}
      </Text>
      <HelperText type="error" visible={Boolean(error)}>
        {error}
      </HelperText>
      <OTPInput
        value={code}
        onChange={handleOnChange}
        maxLength={CODE_LENGTH}
        autoFocus
        editable={!isVerifying}
        containerStyle={{
          marginVertical: 20,
          flexDirection: "row",
          justifyContent: "space-between",
          width: contentWidth - 40,
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
                  width: slotWidth,
                  height: slotHeight,
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
      {isVerifying ? (
        <LoadingSpinner style={{ marginBottom: 12 }} />
      ) : (
        <Text
          variant="bodySmall"
          style={{
            color: theme.colors.onPrimaryContainer,
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          The code will expire in {mm}:{ss}
        </Text>
      )}
      <Crossfade
        activeKey={
          resendConfirmed ? "confirmed" : resendCooldown > 0 ? "cooldown" : "ready"
        }
      >
        {resendConfirmed ? (
          <Text
            variant="bodyMedium"
            style={{
              color: theme.colors.primary,
              textAlign: "center",
              fontWeight: "bold",
            }}
          >
            Code resent!
          </Text>
        ) : resendCooldown > 0 ? (
          <Text
            variant="bodyMedium"
            style={{
              color: theme.colors.onPrimaryContainer,
              textAlign: "center",
            }}
          >
            Resend available in {cooldownMm}:{cooldownSs}
          </Text>
        ) : (
          <Text
            variant="bodyMedium"
            style={{
              color: theme.colors.onPrimaryContainer,
              textAlign: "center",
            }}
          >
            Didn't receive code?{" "}
            <Text
              variant="bodyMedium"
              style={{
                fontWeight: "bold",
                color: theme.colors.primary,
              }}
              onPress={handleResend}
            >
              Resend
            </Text>
          </Text>
        )}
      </Crossfade>
    </ScrollView>
  );
};

export default VerificationCodeContent;
