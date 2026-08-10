import {
  ConfigPlugin,
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
} from "@expo/config-plugins";
import { ConfigContext } from "expo/config";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const BACKGROUND_ACTIONS_SERVICE =
  "com.asterinet.react.bgactions.RNBackgroundActionsTask";

// React Native's build.gradle reads reactNativeArchitectures from
// gradle.properties and uses it to set ndk.abiFilters in defaultConfig.
// Setting it to arm64-v8a strips all other ABI native libs from the APK.
const withArmOnlyAbi: ConfigPlugin = (config) =>
  withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter(
      (item) =>
        !(item.type === "property" && item.key === "reactNativeArchitectures")
    );
    mod.modResults.push({
      type: "property",
      key: "reactNativeArchitectures",
      value: "arm64-v8a",
    });
    return mod;
  });

const withServerCa: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    "android",
    (mod) => {
      const rawDir = path.join(
        mod.modRequest.platformProjectRoot,
        "app/src/main/res/raw"
      );
      fs.mkdirSync(rawDir, { recursive: true });
      fs.copyFileSync(
        path.join(mod.modRequest.projectRoot, "server_ca.pem"),
        path.join(rawDir, "server_ca.pem")
      );
      return mod;
    },
  ]);

const caPath = path.join(__dirname, "server_ca.pem");

if (process.env.SERVER_CA) {
  fs.writeFileSync(
    caPath,
    Buffer.from(process.env.SERVER_CA, "base64").toString("utf-8")
  );
}

// Guard against shipping the committed placeholder CA (short-lived, CN
// "SAPOT LAN Root CA (placeholder)") to a real EAS build. `EAS_BUILD` is set
// by the EAS CLI itself during an actual build, so this never fires for
// local tooling (expo config, expo-doctor, typecheck) that evaluates this
// file without producing an artifact.
const IS_REAL_EAS_BUILD = process.env.EAS_BUILD === "true";
const IS_DEV_BUILD = process.env.APP_VARIANT === "development";
if (IS_REAL_EAS_BUILD && !IS_DEV_BUILD && fs.existsSync(caPath)) {
  const cert = new crypto.X509Certificate(fs.readFileSync(caPath));
  const isPlaceholder = /placeholder/i.test(cert.subject);
  const isExpired = new Date(cert.validTo).getTime() <= Date.now();
  if (isPlaceholder || isExpired) {
    throw new Error(
      `Refusing to build a field (non-dev) variant with the placeholder/expired CA ` +
        `(subject: "${cert.subject}", validTo: ${cert.validTo}). Set the SERVER_CA ` +
        `EAS secret to a real CA before building preview/production.`
    );
  }
}

const withNetworkSecurityConfig: ConfigPlugin = (config) => {
  // Dev builds allow cleartext so the Expo dev client can reach Metro (HTTP).
  // Prod builds lock down to HTTPS-only with the bundled self-signed cert.
  const xml = IS_DEV
    ? `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system"/>
      <certificates src="user"/>
      <certificates src="@raw/server_ca"/>
    </trust-anchors>
  </base-config>
</network-security-config>`
    : `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="false">server.sapot.lan</domain>
    <trust-anchors>
      <certificates src="@raw/server_ca"/>
    </trust-anchors>
  </domain-config>
</network-security-config>`;

  // Step 1: write the XML into res/xml/
  const withWrittenFile: ConfigPlugin = (cfg) =>
    withDangerousMod(cfg, [
      "android",
      (mod) => {
        const resDir = path.join(
          mod.modRequest.platformProjectRoot,
          "app/src/main/res/xml"
        );
        fs.mkdirSync(resDir, { recursive: true });
        fs.writeFileSync(path.join(resDir, "network_security_config.xml"), xml);
        return mod;
      },
    ]);

  // Step 2: wire the attribute into AndroidManifest.xml
  const withManifestAttr: ConfigPlugin = (cfg) =>
    withAndroidManifest(cfg, (mod) => {
      const app = mod.modResults.manifest.application?.[0];
      if (app?.$) {
        app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
      }
      return mod;
    });

  return withManifestAttr(withWrittenFile(config));
};

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
  version: "0.10.0",
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
    withServerCa,
    withNetworkSecurityConfig,
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
        url: "https://sentry.io/",
        project: "sapot-mobile-app",
        organization: "adriele-matthew-tosino",
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
          enableProguardInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
    withArmOnlyAbi,
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
    displayVersion: "0.10.0",
  },
});
