import { registerWebModule, NativeModule } from 'expo';

import { SapotTrustModuleEvents } from './SapotTrust.types';

class SapotTrustModule extends NativeModule<SapotTrustModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(SapotTrustModule, 'SapotTrustModule');
