import { OTPInput } from "input-otp-native";
import React, { useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { HelperText, Modal, Portal, Text, useTheme } from "react-native-paper";

const CODE_LENGTH = 6;

interface VerificationCodeModalProps {
  visible: boolean;
  email?: string;
  error?: string;
  onDismiss: () => void;
  onVerifyCode: (code: string) => Promise<void> | void;
  onResendCode?: () => Promise<void> | void;
}

const VerificationCodeModal = ({
  visible,
  email,
  error,
  onDismiss,
  onVerifyCode,
  onResendCode,
}: VerificationCodeModalProps) => {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const modalWidth = Math.min(width - 32, 420);
  const slotGap = 8;
  const slotWidth = Math.max(
    36,
    Math.floor((modalWidth - 40 - slotGap * (CODE_LENGTH - 1)) / CODE_LENGTH)
  );
  const slotHeight = Math.max(48, Math.floor(slotWidth * 1.2));
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!visible) {
      setCode("");
    }
  }, [visible]);

  const handleOnChange = async (newCode: string) => {
    setCode(newCode);

    if (newCode.length === CODE_LENGTH) {
      await onVerifyCode(newCode);
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={{
          backgroundColor: theme.colors.background,
          alignSelf: "center",
          width: modalWidth,
          borderRadius: 12,
          padding: 20,
        }}
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
          {email ? `We've sent it on your email ${email}` : "We've sent a code"}
        </Text>
        <HelperText type="error" visible={Boolean(error)}>
          {error}
        </HelperText>
        <OTPInput
          value={code}
          onChange={handleOnChange}
          maxLength={CODE_LENGTH}
          autoFocus
          containerStyle={{
            marginVertical: 20,
            flexDirection: "row",
            justifyContent: "space-between",
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
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onPrimaryContainer, textAlign: "center" }}
        >
          The code will expire in {/* TODO: make a countdown */}
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onPrimaryContainer, textAlign: "center" }}
        >
          Didn't receive code?{" "}
          <Text
            variant="bodyMedium"
            style={{
              fontWeight: "bold",
              color: theme.colors.onPrimaryContainer,
            }}
            onPress={onResendCode}
          >
            Resend
          </Text>
        </Text>
      </Modal>
    </Portal>
  );
};

export default VerificationCodeModal;
