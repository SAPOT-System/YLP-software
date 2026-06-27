import { useThrottledPress } from "@/features/shared/hooks";
import { authLog } from "@/features/shared/core/utils/logger";
import React from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import { Button, ButtonProps } from "react-native-paper";

interface SecondaryButtonProps extends ButtonProps {
  children: React.ReactNode;
  onPress: () => void | Promise<void>;
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
  const { onPress: throttledPress, busy } = useThrottledPress(onPress);

  return (
    <Button
      onPress={() => {
        authLog.debug("[SecondaryButton] onPress triggered");
        throttledPress();
      }}
      mode="outlined"
      loading={loading ?? busy}
      disabled={disabled ?? busy}
      style={[styles.button, style]}
      {...props}
    >
      {children}
    </Button>
  );
};

const styles = StyleSheet.create({
  button: {
    width: "100%",
    maxWidth: 400,
    height: 52,
    borderRadius: 30,
    justifyContent: "center",
    alignSelf: "center",
  },
});

export default SecondaryButton;
