import React from "react";
import { StyleSheet, View } from "react-native";
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
  checkIcon?: boolean;
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
  checkIcon,
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
      <View style={{ position: "relative" }}>
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
        {checkIcon && (
          <View style={styles.checkIconOverlay} pointerEvents="none">
            <TextInput.Icon
              icon="check-circle"
              color={theme.colors.primary}
              forceTextInputFocus={false}
              style={{ marginRight: 0 }}
              disabled
            />
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  checkIconOverlay: {
    position: "absolute",
    right: 80, // adjust this value to position left of the pencil icon
    top: 15, // adjust for vertical alignment
    zIndex: 10,
  },
});

export default SettingsTextInput;
