import * as React from 'react';

import { SapotTrustViewProps } from './SapotTrust.types';

export default function SapotTrustView(props: SapotTrustViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
