/**
 * Application color palette supporting both light and dark themes.
 *
 * This object contains all the colors used throughout the application,
 * organized by theme (light/dark) to ensure consistent theming.
 *
 * @example
 * ```typescript
 * import Colors from '@/constants/Colors';
 *
 * const lightTextColor = Colors.light.text;
 * const darkBackgroundColor = Colors.dark.background;
 * ```
 */
export default {
  /** Light theme color palette */
  light: {
    /** Primary text color for headings and important content */
    text: "#103462",
    /** Accent color used for interactive elements like buttons and links */
    tint: "#3A7AFE",
    /** secondary text color for descriptions or labels */
    textSecondary: "#696969",
    /** Muted text color for placeholers or disabled*/
    textMuted: "#6B7280",

    /** Primary background color for screens */
    background: "#fff",
    /** Secondary surface color for background of launch screen*/
    surface: "#EAEDF3",

    /** Default color for inactive tab icons */
    tabIconDefault: "#696969",
    /** Color for active/selected tab icons */
    tabIconSelected: "#3A7AFE",
  },
  /** Dark theme color palette */
  dark: {
    /** Primary text color for headings and important content */
    text: "#fff",
    /** Accent color used for interactive elements like buttons and links */
    tint: "#3A7AFE",
    /** Secondary text color for descriptions or labels*/
    textSecondary: "#D9D9D9",
    /** Muted text color for placeholers or disabled*/
    textMuted: "#696969",

    /** Primary background color for screens */
    background: "#363636",
    /** Secondary surface color for background of launch screen*/
    surface: "#363636",

    /** Default color for inactive tab icons */
    tabIconDefault: "#696969",
    /** Color for active/selected tab icons */
    tabIconSelected: "#3A7AFE",
  },
} as const;

/**
 * Type definition representing the structure of a color scheme.
 * Used to ensure type safety when accessing color properties.
 */
export type ColorScheme = typeof Colors.light;
