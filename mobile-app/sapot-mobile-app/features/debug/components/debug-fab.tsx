import { IS_DEBUG_ENABLED } from "@/config/debug";
import { useRef } from "react";
import { Animated, Dimensions, PanResponder, StyleSheet } from "react-native";
import { FAB } from "react-native-paper";
import { useDebugPanel } from "../hooks/use-debug-panel";

const FAB_SIZE = 56;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const DRAG_THRESHOLD = 4;

export function DebugFab() {
  const { toggle } = useDebugPanel();
  const pan = useRef(
    new Animated.ValueXY({
      x: SCREEN_WIDTH - FAB_SIZE - 16,
      y: SCREEN_HEIGHT - FAB_SIZE - 160,
    })
  ).current;
  const dragDistance = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > DRAG_THRESHOLD ||
        Math.abs(gesture.dy) > DRAG_THRESHOLD,
      onPanResponderGrant: () => {
        dragDistance.current = 0;
        pan.setOffset({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          x: (pan.x as any)._value,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gesture) => {
        dragDistance.current += Math.abs(gesture.dx) + Math.abs(gesture.dy);
        Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        })(_, gesture);
      },
      onPanResponderRelease: () => {
        pan.flattenOffset();
        if (dragDistance.current < DRAG_THRESHOLD) {
          toggle();
        }
      },
    })
  ).current;

  if (!IS_DEBUG_ENABLED) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
      ]}
      {...panResponder.panHandlers}
    >
      <FAB icon="bug" size="small" onPress={toggle} testID="debug-fab" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 999,
    elevation: 999,
  },
});
