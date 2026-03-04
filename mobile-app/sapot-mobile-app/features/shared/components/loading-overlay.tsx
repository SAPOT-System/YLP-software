import React from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import { ActivityIndicator, Portal, Text } from "react-native-paper";

interface LoadingOverlayProps {
  visible: boolean;
  text?: string;
}
const isDark = useColorScheme() === "dark";

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ visible, text }) => {
  if (!visible) return null;
  return (
    <Portal>
      <View style={styles.overlay}>
        <View style={styles.contentRow}>
          <ActivityIndicator animating={true} size="large" color="#3A7AFE" />
          {text ? (
            <View style={styles.textContainer}>
              <Text style={styles.text}>{text}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: isDark ? "rgba(0, 0, 0, 0.7)" : "rgba(255, 255, 255, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: isDark ? "#000" : "#fff",
    width: 419,
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 28,
  },
  textContainer: {
    marginLeft: 18,
    maxWidth: 220,
  },
  text: {
    fontSize: 18,
    fontWeight: "500",
  },
});

export default LoadingOverlay;
