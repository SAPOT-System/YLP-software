import React from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Portal, Text, useTheme } from "react-native-paper";
import baseLogger from "../utils/logger";

const uiLog = baseLogger.extend("ui");
uiLog.debug("[loading-overlay] module loaded");

interface LoadingOverlayProps {
  visible: boolean;
  text?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ visible, text }) => {
  const theme = useTheme();

  if (!visible) return null;
  return (
    <Portal>
      <View
        style={[
          styles.overlay,
          {
            backgroundColor: theme.dark
              ? "rgba(0, 0, 0, 0.7)"
              : "rgba(255, 255, 255, 0.7)",
          },
        ]}
      >
        <View
          style={[
            styles.contentRow,
            { backgroundColor: theme.dark ? "#000" : "#fff" },
          ]}
        >
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
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
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
