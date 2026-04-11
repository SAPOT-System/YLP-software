import { authLog } from "@/features/shared/utils/logger";
import React from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import { Button, ButtonProps } from "react-native-paper";

interface SecondaryButtonProps extends ButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SecondaryButton = ({
  children,
  style,
  loading,
  disabled,
  onPress,
  ...props
}: SecondaryButtonProps) => {
  return (
    <Button
      onPress={() => {
        authLog.debug("[SecondaryButton] onPress triggered");
        onPress();
      }}
      mode="outlined"
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

export default SecondaryButton;
