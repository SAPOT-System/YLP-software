import { saveServerHostOverride } from "@/features/shared/core/stores/secure-config";

const PEM_PATTERN = /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/;
const IPV4_OCTET_PATTERN = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const SERVER_HOSTNAME = "server.sapot.lan";

function isValidPem(pem: string): boolean {
  return PEM_PATTERN.test(pem);
}

function isValidIpv4(ip: string): boolean {
  const octets = ip.split(".");
  if (octets.length !== 4) return false;
  return octets.every((octet) => IPV4_OCTET_PATTERN.test(octet));
}

interface CertProvisioningDeps {
  trust: typeof import("@/modules/sapot-trust");
}

/**
 * Dev/QA service for importing a runtime CA certificate and/or pinning the
 * server's IP address at runtime. Wraps the `sapot-trust` native module and
 * the existing `saveServerHostOverride` secure-storage persistence.
 */
export class CertProvisioningService {
  private readonly trust: CertProvisioningDeps["trust"];

  constructor(deps: CertProvisioningDeps) {
    this.trust = deps.trust;
  }

  async importCaPem(pem: string): Promise<{ fingerprint: string }> {
    if (!isValidPem(pem)) {
      throw new Error("invalid certificate");
    }

    await this.trust.setCaPem(pem);
    const fingerprint = await this.trust.getActiveFingerprint();
    return { fingerprint: fingerprint ?? "" };
  }

  async setServerIp(ip: string): Promise<void> {
    if (!isValidIpv4(ip)) {
      throw new Error("invalid IPv4 address");
    }

    await this.trust.setServerAddress(SERVER_HOSTNAME, ip);
    await saveServerHostOverride(ip);
  }

  async currentFingerprint(): Promise<string | null> {
    return this.trust.getActiveFingerprint();
  }

  async reset(): Promise<void> {
    await this.trust.clearCaPem();
  }
}
