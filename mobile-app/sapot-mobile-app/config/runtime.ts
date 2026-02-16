import * as Updates from "expo-updates";

interface ManifestExtra {
  apiUrl: string;
}

type CustomManifest = Updates.Manifest & {
  extra?: ManifestExtra;
};

export const getApiUrl = () => {
  const manifest = Updates.manifest as CustomManifest;
  return manifest?.extra?.apiUrl;
};