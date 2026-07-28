import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "react-native-paper";
import { Crossfade } from "@/features/shared/components/crossfade";

interface ZeroconfStatusIndicatorProps {
  isPublished: boolean;
  isZeroconfAllowed: boolean;
}

/**
 * A small status indicator that shows whether Zeroconf publication is active.
 * Green dot = published, gray/red dot = not published, hidden = Zeroconf not allowed
 */
export function ZeroconfStatusIndicator({
  isPublished,
  isZeroconfAllowed,
}: ZeroconfStatusIndicatorProps) {
  const theme = useTheme();

  // Don't show the indicator if Zeroconf is not allowed
  if (!isZeroconfAllowed) {
    return null;
  }

  const statusColor = isPublished
    ? theme.colors.primary
    : theme.colors.error;

  const statusIcon = isPublished ? "check-circle" : "alert-circle";

  return (
    <View style={styles.container}>
      <Crossfade activeKey={statusIcon}>
        <MaterialCommunityIcons
          name={statusIcon}
          size={16}
          color={statusColor}
        />
      </Crossfade>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
});
