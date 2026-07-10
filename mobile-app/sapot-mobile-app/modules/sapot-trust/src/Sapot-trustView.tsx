import { requireNativeView } from 'expo';
import * as React from 'react';

import { SapotTrustViewProps } from './Sapot-trust.types';

const NativeView: React.ComponentType<SapotTrustViewProps> =
  requireNativeView('Sapot-trust');

export default function SapotTrustView(props: SapotTrustViewProps) {
  return <NativeView {...props} />;
}
