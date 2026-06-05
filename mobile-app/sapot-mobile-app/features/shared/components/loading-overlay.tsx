import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Icon, Portal, Text, useTheme } from "react-native-paper";
import { uiLog } from "../utils/logger";
uiLog.debug("[loading-overlay] module loaded");

interface LoadingOverlayProps {
  visible: boolean;
  text?: string;
  status?: "loading" | "success" | "error";
  statusMessage?: string;
  displayDurationMs?: number;
  onDismiss?: () => void;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  visible,
  text,
  status = "loading",
  statusMessage,
  displayDurationMs = 1500,
  onDismiss,
}) => {
  const theme = useTheme();

  useEffect(() => {
    if (!visible || status === "loading") return;
    const timer = setTimeout(() => {
      onDismiss?.();
    }, displayDurationMs);
    return () => clearTimeout(timer);
  }, [visible, status, displayDurationMs, onDismiss]);

  if (!visible) return null;

  const isResult = status === "success" || status === "error";

  return (
    <Portal>
      <View
        pointerEvents="box-only"
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
          {isResult ? (
            <Icon
              source={status === "success" ? "check-circle" : "close-circle"}
              size={32}
              color={
                status === "success"
                  ? theme.colors.primary
                  : theme.colors.error
              }
            />
          ) : (
            <ActivityIndicator animating size="large" color="#3A7AFE" />
          )}
          {(isResult ? statusMessage : text) ? (
            <View style={styles.textContainer}>
              <Text style={styles.text}>
                {isResult ? statusMessage : text}
              </Text>
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
