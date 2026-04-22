import { useEffect, useState } from "react";
import * as Location from "expo-location";

export function useLocationPermission() {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      setGranted(status === "granted");
    });
  }, []);

  return granted;
}
