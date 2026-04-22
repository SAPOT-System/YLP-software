import { useAuth, useAuthContainer } from "@/features/auth";
import { getWsUrl } from "@/config/runtime";
import { useEffect, useRef } from "react";
import { useGpsPreference } from "../context/gps-preference-context";
import { GpsLocationService } from "../services/gps-location-service";

export function useGpsStreaming() {
  const service = useRef(new GpsLocationService());
  const { isAuthenticated, isGuest } = useAuth();
  const { sessionStore } = useAuthContainer();
  const { sharingEnabled } = useGpsPreference();

  useEffect(() => {
    if (!isAuthenticated || isGuest || !sharingEnabled) return;

    const userId = sessionStore.userId;
    const wsBase = getWsUrl();
    service.current.start(wsBase, userId);

    return () => {
      service.current.stop();
    };
  }, [isAuthenticated, isGuest, sharingEnabled, sessionStore]);
}
