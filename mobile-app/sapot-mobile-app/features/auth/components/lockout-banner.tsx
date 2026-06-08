import React from "react";
import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";

interface LockoutBannerProps {
  secondsRemaining: number;
  deviceType: string | null;
  onExpire?: () => void;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function deviceLabel(deviceType: string | null): string {
  if (deviceType === "same_device") return "this device";
  if (deviceType === "new_device") return "this new device";
  return "this device";
}

export function LockoutBanner({ secondsRemaining, deviceType, onExpire }: LockoutBannerProps) {
  const { colors } = useTheme();
  const wasLockedRef = React.useRef(false);

  React.useEffect(() => {
    if (secondsRemaining > 0) {
      wasLockedRef.current = true;
    } else if (wasLockedRef.current && onExpire) {
      wasLockedRef.current = false;
      onExpire();
    }
  }, [secondsRemaining, onExpire]);

  return (
    <View style={[styles.container, { backgroundColor: colors.errorContainer }]}>
      <Text style={[styles.text, { color: colors.onErrorContainer }]}>
        Too many failed attempts for {deviceLabel(deviceType)}.{"\n"}
        Try again in {formatCountdown(secondsRemaining)}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
