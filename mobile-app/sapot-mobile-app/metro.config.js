
// import { getDefaultConfig } from "expo/metro-config.js";
import { getSentryExpoConfig } from "@sentry/react-native/metro.js";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('expo/metro-config').MetroConfig} */
const defaultConfig = getSentryExpoConfig(__dirname);

export default {
  ...defaultConfig,
  resolver: {
    ...defaultConfig.resolver,
    assetExts: [...defaultConfig.resolver.assetExts, "pem", "p12"],
  },
  transformer: {
    ...defaultConfig.transformer,
  },
};