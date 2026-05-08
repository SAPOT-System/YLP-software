import React, { ReactNode } from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import { Portal, Snackbar, useTheme } from "react-native-paper";

type SnackbarVariant = "neutral" | "error";

interface AppSnackbarProps {
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
  variant?: SnackbarVariant;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

const SNACKBAR_DEFAULT_DURATION = 3000;

const variantColors: Record<
  SnackbarVariant,
  { backgroundColor: "surfaceVariant" | "errorContainer"; textColor: "onSurfaceVariant" | "onErrorContainer" }
> = {
  neutral: {
    backgroundColor: "surfaceVariant",
    textColor: "onSurfaceVariant",
  },
  error: {
    backgroundColor: "errorContainer",
    textColor: "onErrorContainer",
  },
};

export function AppSnackbar({
  visible,
  onDismiss,
  duration = SNACKBAR_DEFAULT_DURATION,
  variant = "neutral",
  style,
  children,
}: AppSnackbarProps) {
  const theme = useTheme();
  const colors = variantColors[variant];

  return (
    <Portal>
      <Snackbar
        visible={visible}
        onDismiss={onDismiss}
        duration={duration}
        style={[styles.snackbar, style]}
        theme={{
          colors: {
            ...theme.colors,
            inverseSurface: theme.colors[colors.backgroundColor],
            inverseOnSurface: theme.colors[colors.textColor],
          },
        }}
      >
        {children}
      </Snackbar>
    </Portal>
  );
}

const styles = StyleSheet.create({
  snackbar: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
});

export default AppSnackbar;