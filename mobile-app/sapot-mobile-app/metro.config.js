
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
    resolveRequest: (context, moduleName, platform) => {
      // react-native-webrtc's compiled lib does `require("event-target-shim/index")`,
      // a subpath its nested event-target-shim's "exports" map doesn't list.
      // Redirect to the package root, which the exports map does expose.
      if (moduleName === "event-target-shim/index") {
        return context.resolveRequest(context, "event-target-shim", platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
  transformer: {
    ...defaultConfig.transformer,
  },
};