import SapotTrustNativeModule from './src/SapotTrustModule';

export * from './src/SapotTrust.types';

/** True on release/production builds; false in debug builds. */
export function isReleaseBuild(): boolean {
  return SapotTrustNativeModule.isReleaseBuild;
}

/** Pins the server hostname to a specific IP for OkHttp DNS resolution. */
export function setServerAddress(hostname: string, ip: string): Promise<void> {
  return SapotTrustNativeModule.setServerAddress(hostname, ip);
}

/** Returns the currently pinned server hostname/IP, or null if unset. */
export function getServerAddress() {
  return SapotTrustNativeModule.getServerAddress();
}

/** Installs a runtime CA (debug builds only; rejects on release). */
export function setCaPem(pem: string): Promise<void> {
  return SapotTrustNativeModule.setCaPem(pem);
}

/** Clears any runtime CA installed via {@link setCaPem}. */
export function clearCaPem(): Promise<void> {
  return SapotTrustNativeModule.clearCaPem();
}

/** Returns the SHA-256 fingerprint (colon-hex) of the currently active trust anchor. */
export function getActiveFingerprint(): Promise<string | null> {
  return SapotTrustNativeModule.getActiveFingerprint();
}
