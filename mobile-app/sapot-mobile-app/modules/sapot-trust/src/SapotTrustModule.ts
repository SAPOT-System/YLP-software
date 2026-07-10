import { NativeModule, requireNativeModule } from 'expo';

import { SapotServerAddress } from './SapotTrust.types';

declare class SapotTrustModule extends NativeModule {
  isReleaseBuild: boolean;
  setServerAddress(hostname: string, ip: string): Promise<void>;
  getServerAddress(): Promise<SapotServerAddress | null>;
  setCaPem(pem: string): Promise<void>;
  clearCaPem(): Promise<void>;
  getActiveFingerprint(): Promise<string | null>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<SapotTrustModule>('SapotTrust');
