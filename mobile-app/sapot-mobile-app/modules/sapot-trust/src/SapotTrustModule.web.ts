import { registerWebModule, NativeModule } from 'expo';

import { SapotServerAddress } from './SapotTrust.types';

class SapotTrustModule extends NativeModule {
  isReleaseBuild = false;

  async setServerAddress(_hostname: string, _ip: string): Promise<void> {
    throw new Error('SapotTrust.setServerAddress is not supported on web');
  }

  async getServerAddress(): Promise<SapotServerAddress | null> {
    return null;
  }

  async setCaPem(_pem: string): Promise<void> {
    throw new Error('SapotTrust.setCaPem is not supported on web');
  }

  async clearCaPem(): Promise<void> {
    // no-op on web: no runtime CA store exists
  }

  async getActiveFingerprint(): Promise<string | null> {
    return null;
  }
}

export default registerWebModule(SapotTrustModule, 'SapotTrustModule');
