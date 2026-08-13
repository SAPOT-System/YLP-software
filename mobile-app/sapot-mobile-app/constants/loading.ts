/**
 * Timing policy for skeleton loading placeholders.
 *
 * Deliberately independent of animation timings: changing motion feel must
 * not silently alter the guard against loading flashes.
 */
const loading = {
  /** Loads faster than this never show a skeleton at all. */
  skeletonDelay: 150,
  /** Once shown, a skeleton stays up at least this long. */
  skeletonMinDuration: 400,
} as const;

export default loading;
