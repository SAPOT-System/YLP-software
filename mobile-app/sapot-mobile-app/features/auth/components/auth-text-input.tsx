import React, { useState } from "react";
import { Text, TextInput, TextInputProps, useTheme } from "react-native-paper";

interface AuthTextInputProps extends TextInputProps {
  placeholder: string;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  required?: boolean;
  error?: boolean;
}

const AuthTextInput = ({
  placeholder,
  label,
  value,
  onChangeText,
  error,
  required,
  secureTextEntry,
  ...props
}: AuthTextInputProps) => {
  const theme = useTheme();
  const [hidden, setHidden] = useState(!!secureTextEntry);

  return (
    <>
      <Text
        variant="labelLarge"
        style={{ fontWeight: "semibold", color: theme.colors.onSurface }}
      >
        {label}{" "}
        {required && <Text style={{ color: theme.colors.error }}>*</Text>}
      </Text>
      <TextInput
        mode="outlined"
        placeholder={placeholder}
        outlineStyle={{ borderRadius: 10 }}
        value={value}
        onChangeText={(text) => {
          onChangeText(text);
        }}
        error={error}
        outlineColor={theme.colors.outlineVariant}
        secureTextEntry={hidden}
        right={
          secureTextEntry ? (
            <TextInput.Icon
              icon={hidden ? "eye-off" : "eye"}
              onPress={() => setHidden((prev) => !prev)}
              color={theme.colors.onSurfaceVariant}
            />
          ) : undefined
        }
        {...props}
      />
    </>
  );
};

export default AuthTextInput;
