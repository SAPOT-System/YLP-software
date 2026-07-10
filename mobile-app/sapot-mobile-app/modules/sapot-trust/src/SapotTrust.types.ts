import type { StyleProp, ViewStyle } from 'react-native';

export type SapotServerAddress = {
  hostname: string;
  ip: string;
};

// Retained for the generator-scaffolded (unused) SapotTrustView; the trust manager
// itself has no native view. Safe to delete once SapotTrustView.tsx is removed.
export type SapotTrustViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: { url: string } }) => void;
  style?: StyleProp<ViewStyle>;
};
