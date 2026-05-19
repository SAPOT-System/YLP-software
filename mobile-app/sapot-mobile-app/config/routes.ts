import { routesLog } from "@/features/shared/utils/logger";

export const AUTH_ROUTES = {
  LOGIN: {
    LAN_LOGIN: "/auth/login/lan-login",
    SERVER_LOGIN: "/auth/login/server-login",
  },
  FORGOT_PASSWORD: {
    INDEX: "/auth/forgot-password",
    ENTER_IDENTIFIER: "/auth/forgot-password/enter-identifier",
    ENTER_RECOVERY: "/auth/forgot-password/enter-recovery",
    QUESTION_RESET: "/auth/forgot-password/question-reset",
    RECOVERY_KEY_RESET: "/auth/forgot-password/recovery-key-reset",
    RESET_PASSWORD: "/auth/forgot-password/reset-password",
    SMS_RESET: "/auth/forgot-password/sms-reset",
    SUCCESS: "/auth/forgot-password/success",
  },
  REGISTER: "/auth/register",
  GETTING_STARTED: "/getting-started",
} as const;

export const SETTINGS_ROUTES = {
  // Account
  MANAGE_PROFILE: "/(drawer)/settings/account/manage-profile",
  PASSWORD_AND_SECURITY: "/(drawer)/settings/account/password-and-security",
  CHANGE_PASSWORD: "/(drawer)/settings/account/change-password",
  SECURITY_QUESTION: "/(drawer)/settings/account/security-question",
  GENERATE_RECOVERY_KEY: "/(drawer)/settings/account/generate-recovery-key",
  AUTHENTICATE: "/(drawer)/settings/account/authenticate",
  CONTACTS: "/(drawer)/settings/account/contacts",
  QR_CODE: "/(drawer)/settings/account/qr-code",
  SWITCH_MODE: "/(drawer)/settings/account/switch-mode",
  // Account email
  UPDATE_EMAIL: "/(drawer)/settings/account/email/update-email",
  VERIFY_EMAIL: "/(drawer)/settings/account/email/verify-email",
  // Account phone
  VERIFY_PHONE: "/(drawer)/settings/account/phone/verify-phone",

  // Preferences
  THEME: "/(drawer)/settings/preferences/theme",
  GPS: "/(drawer)/settings/preferences/gps",
  NOTIFICATIONS: "/(drawer)/settings/preferences/notifications",

  // Support
  ABOUT_US: "/(drawer)/settings/support/about-us",
  HELP_CENTER: "/(drawer)/settings/support/help-center",
} as const;
export const APP_ROUTES = {
  HOME: "/(drawer)/(tabs)",
  SETTINGS: "/(drawer)/(tabs)/settings",
  SEARCH: "/(drawer)/search",
  SCAN_QR: "/(drawer)/(tabs)/scan-qr",
  PEER_PROFILE: "/(drawer)/(tabs)/peer/[id]",
  ANNOUNCEMENTS: "/(drawer)/announcements",
} as const;

routesLog.debug("[Routes] loaded");
