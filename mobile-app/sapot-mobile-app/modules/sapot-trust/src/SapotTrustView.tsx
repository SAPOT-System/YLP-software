import { requireNativeView } from 'expo';
import * as React from 'react';

import { SapotTrustViewProps } from './SapotTrust.types';

const NativeView: React.ComponentType<SapotTrustViewProps> =
  requireNativeView('SapotTrust');

export default function SapotTrustView(props: SapotTrustViewProps) {
  return <NativeView {...props} />;
}
