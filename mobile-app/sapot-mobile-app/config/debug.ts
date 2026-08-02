export const IS_DEBUG_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_DEBUG_MENU === "1";

// Sent as X-QA-Token by DebugAuthService.loginAs() — must match the server's
// QA_API_TOKEN. Unset outside a debug build, same as every other QA endpoint.
export const QA_API_TOKEN = process.env.EXPO_PUBLIC_QA_API_TOKEN;
