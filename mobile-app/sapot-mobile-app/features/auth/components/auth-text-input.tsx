import React, { forwardRef, useState } from "react";
import { Text, TextInput, TextInputProps, useTheme } from "react-native-paper";

export interface PaperTextInputRef {
  focus: () => void;
  clear: () => void;
  blur: () => void;
  isFocused: () => boolean;
  setNativeProps: (props: object) => void;
}

interface AuthTextInputProps extends TextInputProps {
  placeholder: string;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  required?: boolean;
  error?: boolean;
}

const AuthTextInput = forwardRef<PaperTextInputRef, AuthTextInputProps>(
  (
    {
      placeholder,
      label,
      value,
      onChangeText,
      error,
      required,
      secureTextEntry,
      ...props
    },
    ref
  ) => {
    const theme = useTheme();
    const [hidden, setHidden] = useState(!!secureTextEntry);

    return (
      <>
        <Text
          variant="labelLarge"
          style={{ fontWeight: "600", color: theme.colors.onSurface }}
        >
          {label}{" "}
          {required && <Text style={{ color: theme.colors.error }}>*</Text>}
        </Text>
        <TextInput
          ref={ref as React.Ref<never>}
          mode="outlined"
          placeholder={placeholder}
          outlineStyle={{ borderRadius: 10 }}
          value={value}
          onChangeText={onChangeText}
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
  }
);

AuthTextInput.displayName = "AuthTextInput";

export default AuthTextInput;
