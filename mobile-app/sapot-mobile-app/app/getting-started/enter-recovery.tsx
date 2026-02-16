import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { CodeInput } from "@/features/auth";
import React, { useRef, useState } from "react";
import {
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  View,
} from "react-native";
import { Text, TextInput, useTheme } from "react-native-paper";

const CODE_LENGTH = 4;

const EnterRecoveryScreen = () => {
  const theme = useTheme();
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const refs = useRef<React.ComponentRef<typeof TextInput>[]>([]);

  const handleChange = (text: string, index: number) => {
    if (!/^\d?$/.test(text)) return; // only numbers

    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);

    if (text && index < CODE_LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number
  ) => {
    if (e.nativeEvent.key === "Backspace" && !code[index] && index > 0) {
      refs.current[index - 1]?.focus();
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
        <CodeInput
          code={code}
          refs={refs}
          onChangeText={handleChange}
          onKeyPress={handleKeyPress}
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
            onPress={() => {
              // TODO: make a resend code mechanism
            }}
          >
            Resend
          </Text>
        </Text>
      </ScreenContent>
    </View>
  );
};

export default EnterRecoveryScreen;
