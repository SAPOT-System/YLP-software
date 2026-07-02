import { useAuth, useAuthContainer } from "@/features/auth";
import { getWsUrl } from "@/config/runtime";
import { useEffect, useRef } from "react";
import { useGpsPreference } from "../context/gps-preference-context";
import { GpsLocationService } from "../services/gps-location-service";

export function useGpsStreaming() {
  const service = useRef(new GpsLocationService());
  const { isAuthenticated, isGuest, accessToken } = useAuth();
  const { sessionStore } = useAuthContainer();
  const { sharingEnabled } = useGpsPreference();

  useEffect(() => {
    if (!isAuthenticated || isGuest || !sharingEnabled || !accessToken) return;
    const gpsLocation = service.current;

    const userId = sessionStore.userId;
    const wsBase = getWsUrl();
    gpsLocation.start(wsBase, userId, accessToken);

    return () => {
      gpsLocation.stop();
    };
  }, [isAuthenticated, isGuest, sharingEnabled, accessToken, sessionStore]);
}
