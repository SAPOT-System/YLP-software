import React from "react";
import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";

interface BannedBannerProps {
  message: string;
}

export function BannedBanner({ message }: BannedBannerProps) {
  const { colors } = useTheme();

  return (
    <View
      testID="banned-banner"
      style={[styles.container, { backgroundColor: colors.errorContainer }]}
    >
      <Text style={[styles.text, { color: colors.onErrorContainer }]}>
        {message}
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
