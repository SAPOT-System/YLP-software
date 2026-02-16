import * as Updates from "expo-updates";

interface ManifestExtra {
  apiUrl: string;
}

type CustomManifest = Updates.Manifest & {
  extra?: ManifestExtra;
};

export const getApiUrl = () => {
  if (process.env.NODE_ENV === "development") {
    return "http://10.0.2.2:8000";
  }

  // TODO: needs build to work
  const manifest = Updates.manifest as CustomManifest;
  return manifest?.extra?.apiUrl;
};
