import { Alert, PermissionsAndroid, Platform } from "react-native";

export function useMediaPermissions() {
  const requestMediaPermissions = async (
    type: "audio" | "video"
  ): Promise<boolean> => {
    if (Platform.OS !== "android") return true;

    const perms: string[] = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (type === "video") {
      perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    }

    const results = await PermissionsAndroid.requestMultiple(
      perms as Parameters<typeof PermissionsAndroid.requestMultiple>[0]
    );

    const allGranted = Object.values(results).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED
    );

    if (!allGranted) {
      Alert.alert(
        "Permission Required",
        `${type === "video" ? "Camera and microphone" : "Microphone"} permission is required for calls.`
      );
    }

    return allGranted;
  };

  return { requestMediaPermissions };
}
