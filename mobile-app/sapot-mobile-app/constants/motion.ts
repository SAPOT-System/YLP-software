/**
 * Shared motion tokens: duration scale, easing curves, and spring presets.
 *
 * Easing curves are stored as raw cubic-bezier control points rather than
 * `Easing.bezier(...)` instances because the legacy `Animated` API
 * (`react-native`'s `Easing`) and Reanimated's `Easing` are separate,
 * incompatible modules. Call sites wrap the tuple with whichever `Easing`
 * they use: `Easing.bezier(...motion.easing.standard)`.
 */
const motion = {
  duration: {
    fast: 150,
    base: 250,
    slow: 400,
  },
  easing: {
    /** General UI transitions: fades, toggles, status changes. */
    standard: [0.2, 0, 0, 1],
    /** Entrances that should feel deliberate: success states, sheets. */
    emphasized: [0.05, 0.7, 0.1, 1],
    /** Exits and fades out. */
    exit: [0.4, 0, 1, 1],
  },
  spring: {
    /** Gentle overshoot for banners and success states. */
    gentle: { damping: 12, stiffness: 120 },
  },
} as const;

export default motion;

export type MotionDuration = keyof typeof motion.duration;
export type MotionEasing = keyof typeof motion.easing;
