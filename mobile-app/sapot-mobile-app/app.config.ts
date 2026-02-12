{
  "expo": {
    "name": "sapot-mobile-app",
    "slug": "sapot-mobile-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/logo.png",
    "scheme": "sapotmobileapp",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "splash": {
      "image": "./assets/images/logo.png",
      "resizeMode": "contain",
      "backgroundColor": "#EAEDF3"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.devamt.sapotmobileapp"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/logo.png",
        "backgroundColor": "#ffffff"
      },
      "edgeToEdgeEnabled": true,
      "predictiveBackGestureEnabled": false,
      "package": "com.devamt.sapotmobileapp",
      "permissions": [
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.ACCESS_WIFI_STATE",
        "android.permission.CHANGE_WIFI_MULTICAST_STATE",
        "android.permission.INTERNET",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.VIBRATE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.CHANGE_NETWORK_STATE",
        "android.permission.MODIFY_AUDIO_SETTINGS"
      ]
    },
    "web": {
      "bundler": "metro",
      "output": "static",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      [
        "@lovesworking/watermelondb-expo-plugin-sdk-52-plus",
        {
          "disableJsi": true
        }
      ],
      "expo-router",
      "expo-secure-store",
      [
        "expo-build-properties",
        {
          "android": {
            "packagingOptions": {
              "pickFirst": ["**/libc++_shared.so"]
            }
          }
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    },
    "runtimeVersion": {
      "policy": "appVersion"
    },
    "extra": {
      "router": {},
      "eas": {
        "projectId": "ee940ed5-5653-43cb-8938-d5f54a830c59"
      }
    }
  }
}
