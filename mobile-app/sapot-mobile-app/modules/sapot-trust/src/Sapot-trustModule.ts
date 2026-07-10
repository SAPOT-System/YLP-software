import { NativeModule, requireNativeModule } from 'expo';

import { SapotTrustModuleEvents } from './Sapot-trust.types';

declare class SapotTrustModule extends NativeModule<SapotTrustModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<SapotTrustModule>('Sapot-trust');
