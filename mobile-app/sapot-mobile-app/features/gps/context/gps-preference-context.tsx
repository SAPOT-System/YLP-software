import { getItemAsync, setItemAsync } from "expo-secure-store";
import React, { createContext, useContext, useEffect, useState } from "react";

const STORE_KEY = "gps_sharing_enabled";

type GpsPreferenceContextValue = {
  sharingEnabled: boolean;
  setSharingEnabled: (enabled: boolean) => void;
};

const GpsPreferenceContext = createContext<GpsPreferenceContextValue | null>(
  null
);

export function GpsPreferenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sharingEnabled, setSharingEnabledState] = useState(true);

  useEffect(() => {
    getItemAsync(STORE_KEY).then((val) => {
      if (val !== null) setSharingEnabledState(val === "true");
    });
  }, []);

  const setSharingEnabled = (enabled: boolean) => {
    setSharingEnabledState(enabled);
    setItemAsync(STORE_KEY, String(enabled));
  };

  return (
    <GpsPreferenceContext.Provider value={{ sharingEnabled, setSharingEnabled }}>
      {children}
    </GpsPreferenceContext.Provider>
  );
}

export function useGpsPreference() {
  const ctx = useContext(GpsPreferenceContext);
  if (!ctx)
    throw new Error("useGpsPreference must be within GpsPreferenceProvider");
  return ctx;
}
