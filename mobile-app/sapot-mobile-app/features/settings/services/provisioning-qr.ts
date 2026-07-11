export interface ProvisioningQrPayload {
  ip: string;
  caFp: string;
}

/**
 * Parses a scanned QR code payload for dev/QA server provisioning.
 * Expected shape: `{ "ip": string, "caFp": string }`.
 *
 * `caFp` is used purely as an out-of-band confirmation that the operator
 * scanned the expected server (compared against the currently active trust
 * anchor's fingerprint) — it is not itself a trust decision. The CA
 * certificate must already be bundled or separately imported via PEM.
 */
export function parseProvisioningQr(raw: string): ProvisioningQrPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("invalid QR payload");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("invalid QR payload");
  }

  const { ip, caFp } = parsed as Record<string, unknown>;

  if (typeof ip !== "string" || typeof caFp !== "string" || !ip || !caFp) {
    throw new Error("invalid QR payload");
  }

  return { ip, caFp };
}
