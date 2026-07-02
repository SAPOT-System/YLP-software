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

const SHORT_COOLDOWN_THRESHOLD_SECONDS = 120;

export function LockoutBanner({ secondsRemaining, deviceType, onExpire }: LockoutBannerProps) {
  const { colors } = useTheme();
  const prevSecondsRef = React.useRef(secondsRemaining);
  const initialSecondsRef = React.useRef(secondsRemaining);

  React.useEffect(() => {
    if (prevSecondsRef.current > 0 && secondsRemaining === 0 && onExpire) {
      onExpire();
    }
    prevSecondsRef.current = secondsRemaining;
  }, [secondsRemaining, onExpire]);

  const isCooldown = initialSecondsRef.current <= SHORT_COOLDOWN_THRESHOLD_SECONDS;
  const label = isCooldown
    ? `Too many attempts. Please wait ${formatCountdown(secondsRemaining)} before trying again.`
    : `Too many failed attempts for ${deviceLabel(deviceType)}.\nTry again in ${formatCountdown(secondsRemaining)}.`;

  return (
    <View style={[styles.container, { backgroundColor: colors.errorContainer }]}>
      <Text style={[styles.text, { color: colors.onErrorContainer }]}>
        {label}
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
