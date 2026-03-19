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
} as const;

export const SETTINGS_ROUTES = {
  MANAGE_PROFILE: "/(drawer)/settings/account/manage-profile",
    PASSWORD_AND_SECURITY: "/(drawer)/settings/account/password-and-security",
    CHANGE_PASSWORD: "/(drawer)/settings/account/change-password",
} as const;
export const APP_ROUTES = {
  HOME: "/(drawer)/(tabs)",
  SEARCH: "/(drawer)/search",
} as const;
