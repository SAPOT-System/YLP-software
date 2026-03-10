import React from "react";
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
  ...props
}: AuthTextInputProps) => {
  const theme = useTheme();
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
        // label={label}
        value={value}
        onChangeText={onChangeText}
        error={error}
        outlineColor={theme.colors.outlineVariant}
        {...props}
      />
    </>
  );
};

export default AuthTextInput;
