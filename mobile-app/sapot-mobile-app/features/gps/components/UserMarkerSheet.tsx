import { formatRelativeTime } from "../utils/format-relative-time";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Pressable, StyleSheet, View } from "react-native";
import { Button, Icon, IconButton, Text, useTheme } from "react-native-paper";
import { LoadingSpinner } from "@/features/shared/components/loading-spinner";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useRef, useState } from "react";
import motion from "@/constants/motion";
import { useReducedMotion } from "@/features/shared/hooks";

export type SelectedUser = {
  user_id: string;
  username: string;
  timestamp: string;
};

interface UserMarkerSheetProps {
  selectedUser: SelectedUser | null;
  onDismiss: () => void;
  onMessage: (userId: string) => void;
  onViewPath: (userId: string) => void;
  hasPath: boolean;
  isPathLoading: boolean;
  onClearPath: () => void;
  pathMode: boolean;
}

const SHEET_HEIGHT = 240;
// Height of the handle strip that stays visible when hidden
const PEEK_HEIGHT = 28;
const HIDDEN_TRANSLATE = SHEET_HEIGHT - PEEK_HEIGHT;
const SWIPE_THRESHOLD = 60;

export function UserMarkerSheet({
  selectedUser,
  onDismiss,
  onMessage,
  onViewPath,
  hasPath,
  isPathLoading,
  onClearPath,
  pathMode,
}: UserMarkerSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const transitionConfig = {
    duration: reducedMotion ? 0 : motion.duration.base,
    easing: Easing.bezier(...motion.easing.standard),
  };

  const [isHidden, setIsHidden] = useState(false);
  // Ref so gesture callbacks (which close over a stale closure) read fresh value
  const isHiddenRef = useRef(false);

  const setHidden = (val: boolean) => {
    isHiddenRef.current = val;
    setIsHidden(val);
  };

  // Slide to peek when a path loads; snap back when path is cleared
  useEffect(() => {
    if (hasPath) {
      setHidden(true);
      snapTo(true);
    } else if (isHiddenRef.current) {
      setHidden(false);
      snapTo(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPath]);

  // Slide in when a user is selected; peek when path mode is active
  useEffect(() => {
    if (selectedUser !== null) {
      if (pathMode) {
        setHidden(true);
        snapTo(true);
      } else {
        setHidden(false);
        translateY.value = withTiming(0, transitionConfig);
        backdropOpacity.value = withTiming(1, transitionConfig);
      }
    } else {
      setHidden(false);
      translateY.value = withTiming(SHEET_HEIGHT, transitionConfig);
      backdropOpacity.value = withTiming(0, transitionConfig);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, pathMode]);

  const snapTo = (hidden: boolean) => {
    const targetY = hidden ? HIDDEN_TRANSLATE : 0;
    translateY.value = withTiming(targetY, transitionConfig);
    backdropOpacity.value = withTiming(hidden ? 0 : 1, transitionConfig);
  };

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      const hidden = isHiddenRef.current;
      if (!hidden && e.translationY > 0) {
        // Dragging sheet down from visible
        translateY.value = e.translationY;
        backdropOpacity.value = Math.max(
          0,
          1 - e.translationY / HIDDEN_TRANSLATE
        );
      } else if (hidden && e.translationY < 0) {
        // Dragging sheet up from peek
        const newY = Math.max(0, HIDDEN_TRANSLATE + e.translationY);
        translateY.value = newY;
        backdropOpacity.value = 1 - newY / HIDDEN_TRANSLATE;
      }
    })
    .onEnd((e) => {
      const hidden = isHiddenRef.current;
      if (!hidden && e.translationY > SWIPE_THRESHOLD) {
        setHidden(true);
        snapTo(true);
      } else if (hidden && e.translationY < -SWIPE_THRESHOLD) {
        setHidden(false);
        snapTo(false);
      } else {
        snapTo(hidden);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (selectedUser === null) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dim backdrop — only interactive when sheet is visible */}
      <Animated.View
        style={[styles.backdrop, backdropStyle]}
        pointerEvents={isHidden ? "none" : "auto"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => snapTo(false)} />
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.sheet,
            sheetStyle,
            {
              backgroundColor: theme.colors.surface,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          {/* Drag handle */}
          <View style={styles.handleRow}>
            <View
              style={[
                styles.handle,
                { backgroundColor: theme.colors.outlineVariant },
              ]}
            />
          </View>

          {/* Header: username + close button */}
          <View style={styles.header}>
            <Icon
              source="map-marker-account"
              size={22}
              color={theme.colors.primary}
            />
            <Text variant="titleMedium" style={styles.username} numberOfLines={1}>
              {selectedUser.username}
            </Text>
            <IconButton
              icon="close"
              size={20}
              onPress={onDismiss}
              style={styles.closeButton}
            />
          </View>

          <Text
            variant="bodySmall"
            style={[styles.lastSeen, { color: theme.colors.onSurfaceVariant }]}
          >
            Updated {formatRelativeTime(selectedUser.timestamp)}
          </Text>

          <View style={styles.actions}>
            {isPathLoading ? (
              <View style={[styles.actionButton, styles.pathLoading]}>
                <LoadingSpinner />
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Loading path...
                </Text>
              </View>
            ) : hasPath ? (
              <Button
                mode="outlined"
                icon="map-marker-path"
                style={styles.actionButton}
                onPress={onClearPath}
              >
                Clear Path
              </Button>
            ) : (
              <Button
                mode="outlined"
                icon="map-marker-path"
                style={styles.actionButton}
                onPress={() => onViewPath(selectedUser.user_id)}
              >
                View Path
              </Button>
            )}
            <Button
              mode="contained"
              icon="message"
              style={styles.actionButton}
              onPress={() => onMessage(selectedUser.user_id)}
            >
              Message
            </Button>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  handleRow: {
    alignItems: "center",
    paddingBottom: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  username: {
    flex: 1,
    fontWeight: "bold",
  },
  closeButton: {
    margin: 0,
  },
  lastSeen: {
    marginBottom: 20,
    marginLeft: 2,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  pathLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
