import React from "react";
import { Text, TextInput, TextInputProps, useTheme } from "react-native-paper";
import { View } from "react-native";

interface SettingsTextInputProps extends TextInputProps {
  placeholder: string;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  icon?: string;
  required?: boolean;
  error?: boolean;
}

const SettingsTextInput = ({
  placeholder,
  label,
  value,
  onChangeText,
  icon,
  error,
  required,
  ...props
}: SettingsTextInputProps) => {
  const theme = useTheme();
  return (
    <View>
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
        right={icon ? <TextInput.Icon icon={icon} /> : ""}
        {...props}
      />
    </View>
  );
};

export default SettingsTextInput;
