import { ConfigContext, ExpoConfig } from "expo/config";
const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";
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

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: getAppName(),
  slug: "sapot-mobile-app",
  version: "0.2.0",
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
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    url: "https://u.expo.dev/ee940ed5-5653-43cb-8938-d5f54a830c59",
  },
  extra: {
    router: {},
    eas: {
      projectId: "ee940ed5-5653-43cb-8938-d5f54a830c59",
    },
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  },
});
