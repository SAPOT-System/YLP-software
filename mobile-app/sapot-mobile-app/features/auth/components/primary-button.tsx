import { authLog } from "@/features/shared/utils/logger";
import React from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import { Button, ButtonProps } from "react-native-paper";

interface PrimaryButtonProps extends ButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const PrimaryButton = ({
  children,
  style,
  loading,
  disabled,
  onPress,
  ...props
}: PrimaryButtonProps) => {
  return (
    <Button
      onPress={() => {
        authLog.debug("[PrimaryButton] onPress triggered");
        onPress();
      }}
      mode="contained"
      loading={loading}
      disabled={disabled}
      style={[styles.button, style]}
      {...props}
    >
      {children}
    </Button>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 280,
    height: 52,
    borderRadius: 30,
    justifyContent: "center",
  },
});

export default PrimaryButton;
