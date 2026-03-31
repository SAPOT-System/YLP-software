import React from "react";
import { View } from "react-native";
import { Text, TextInput, TextInputProps, useTheme } from "react-native-paper";

interface SettingsTextInputProps extends TextInputProps {
  placeholder: string;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  icon?: string;
  onIconPress?: () => void;
  required?: boolean;
  error?: boolean;
  labelRight?: React.ReactNode;
  disabled?: boolean;
}

const SettingsTextInput = ({
  placeholder,
  label,
  value,
  onChangeText,
  icon,
  onIconPress,
  error,
  required,
  labelRight,
  disabled,
  ...props
}: SettingsTextInputProps) => {
  const theme = useTheme();
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        <Text
          variant="labelLarge"
          style={{ fontWeight: "semibold", color: theme.colors.onSurface }}
        >
          {label}{" "}
          {required && <Text style={{ color: theme.colors.error }}>*</Text>}
        </Text>
        {labelRight}
      </View>
      <TextInput
        mode="outlined"
        placeholder={placeholder}
        outlineStyle={{ borderRadius: 10 }}
        // label={label}
        value={value}
        onChangeText={onChangeText}
        error={error}
        outlineColor={theme.colors.outlineVariant}
        right={
          icon ? (
            <TextInput.Icon
              icon={icon}
              onPress={onIconPress}
              disabled={false}
              forceTextInputFocus={false}
              color={theme.colors.onSurface}
            />
          ) : undefined
        }
        disabled={disabled}
        {...props}
      />
    </View>
  );
};

export default SettingsTextInput;
