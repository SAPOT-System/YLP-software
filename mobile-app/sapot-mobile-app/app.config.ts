import { ConfigPlugin, withAndroidManifest, withDangerousMod } from "@expo/config-plugins";
import { ConfigContext } from "expo/config";
import * as fs from "fs";
import * as path from "path";

const BACKGROUND_ACTIONS_SERVICE =
  "com.asterinet.react.bgactions.RNBackgroundActionsTask";

const withServerCert: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    "android",
    (mod) => {
      const rawDir = path.join(
        mod.modRequest.platformProjectRoot,
        "app/src/main/res/raw"
      );
      fs.mkdirSync(rawDir, { recursive: true });
      fs.copyFileSync(
        path.join(mod.modRequest.projectRoot, "server_cert.pem"),
        path.join(rawDir, "server_cert.pem")
      );
      return mod;
    },
  ]);

const withCleartextTraffic: ConfigPlugin = (config) =>
  withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (app?.$) {
      app.$["android:usesCleartextTraffic"] = "true";
    }
    return mod;
  });

const withBackgroundActionsForegroundService: ConfigPlugin = (config) =>
  withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (!app) return mod;

    const services = app.service ?? [];
    const existing = services.find(
      (service) =>
        service.$?.["android:name"] === BACKGROUND_ACTIONS_SERVICE ||
        service.$?.["android:name"] === ".RNBackgroundActionsTask"
    );

    const serviceAttributes = {
      "android:name": BACKGROUND_ACTIONS_SERVICE,
      "android:enabled": "true" as const,
      "android:exported": "false" as const,
      "android:foregroundServiceType": "dataSync",
      "tools:replace":
        "android:enabled,android:exported,android:foregroundServiceType",
    };

    if (existing) {
      existing.$ = {
        ...existing.$,
        ...serviceAttributes,
      };
    } else {
      services.push({
        $: serviceAttributes,
      });
    }

    app.service = services;

    return mod;
  });

const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";
const getChannel = () => {
  if (IS_DEV) {
    return "development";
  }

  if (IS_PREVIEW) {
    return "preview";
  }

  return "production";
};

const getUniqueIdentifier = () => {
  if (IS_DEV) {
    return "com.devamt.sapotmobileapp.dev";
  }

  if (IS_PREVIEW) {
    return "com.devamt.sapotmobileapp.preview";
  }

  return "com.devamt.sapotmobileapp";
};

const getAppName = () => {
  if (IS_DEV) {
    return "SAPOT (Dev)";
  }

  if (IS_PREVIEW) {
    return "SAPOT (Preview)";
  }

  return "SAPOT: LAN Messenger";
};

export default ({ config }: ConfigContext) => ({
  ...config,
  name: getAppName(),
  slug: "sapot-mobile-app",
  version: "0.4.3",
  orientation: "portrait",
  icon: "./assets/images/logo.png",
  scheme: "sapotmobileapp",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/logo.png",
    resizeMode: "contain",
    backgroundColor: "#EAEDF3",
  },
  hooks: {
    prebuild: "node ./scripts/setup-android-signing.js",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/logo.png",
      backgroundColor: "#ffffff",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: getUniqueIdentifier(),
    permissions: [
      "android.permission.ACCESS_NETWORK_STATE",
      "android.permission.ACCESS_WIFI_STATE",
      "android.permission.CHANGE_WIFI_MULTICAST_STATE",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.BLUETOOTH",
      "android.permission.BLUETOOTH_CONNECT",
      "android.permission.WAKE_LOCK",
      "android.permission.BLUETOOTH_ADMIN",
      "android.permission.INTERNET",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.VIBRATE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
      "android.permission.CHANGE_NETWORK_STATE",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
    ],
  },
  plugins: [
    [
      "expo-notifications",
      {
        sounds: ["./assets/ringtone.mp3"],
      },
    ],
    [
      "expo-background-task",
      {
        android: {
          foregroundService: {
            notificationTitle: "App is running",
            notificationBody: "Listening for incoming calls...",
            notificationColor: "#ffffff",
          },
        },
      },
    ],
    [
      "@lovesworking/watermelondb-expo-plugin-sdk-52-plus",
      {
        disableJsi: true,
      },
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "Allow $(PRODUCT_NAME) to access your location.",
      },
    ],
    withBackgroundActionsForegroundService,
    withCleartextTraffic,
    withServerCert,
    "expo-router",
    "expo-secure-store",
    [
      "expo-camera",
      {
        cameraPermission: "Allow $(PRODUCT_NAME) to access your camera",
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone",
        recordAudioAndroid: true,
        barcodeScannerEnabled: true,
      },
    ],
    [
      "@sentry/react-native/expo",
      {
        "url": "https://sentry.io/",
        "project": "sapot-mobile-app",
        "organization": "adriele-matthew-tosino"
      }
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "The app accesses your photos to let you share them with your friends.",
        colors: {
          cropToolbarColor: "#000000",
        },
        dark: {
          colors: {
            cropToolbarColor: "#000000",
          },
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          packagingOptions: {
            pickFirst: ["**/libc++_shared.so"],
          },
          networkSecurityConfig: "./android-network-security-config.xml",
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  runtimeVersion: "preview",
  updates: {
    channel: getChannel(),
    url: "https://u.expo.dev/ee940ed5-5653-43cb-8938-d5f54a830c59",
  },
  extra: {
    router: {},
    eas: {
      projectId: "ee940ed5-5653-43cb-8938-d5f54a830c59",
    },
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    displayVersion: "0.4.3",
  },
});
