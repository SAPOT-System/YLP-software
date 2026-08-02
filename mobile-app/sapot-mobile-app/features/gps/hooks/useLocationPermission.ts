import { useEffect, useState } from "react";
import * as Location from "expo-location";

export type LocationPermissionState = "not-asked" | "granted" | "denied";

export function useLocationPermission(): LocationPermissionState {
  const [state, setState] = useState<LocationPermissionState>("not-asked");

  useEffect(() => {
    let isMounted = true;

    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (!isMounted) return;
      setState(status === "granted" ? "granted" : "denied");
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return state;
}
