import { toAppError } from "@/features/shared/errors";
import { deriveKey } from "@/features/shared/services/key-derivation";
import { KeyRecoveryService } from "@/features/shared/services/key-recovery-service";
import { authLog } from "@/features/shared/utils/logger";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";
import { fetchRecoveryBlobApi } from "../api/auth.api";

const ITERATIONS: Record<string, number> = {
  sms: 200_000,
  email: 100_000,
  qa: 300_000,
  token: 100_000,
};

const BLOB_METHODS: Record<string, string> = {
  sms: "phone",
  email: "email",
  qa: "qa",
  token: "token",
};

interface Params {
  identifier: string;     // phone / email (blob secret for sms/email methods)
  method: string;         // "sms" | "email" | "qa" | "token"
  recoveryToken?: string; // from server after any verification method
  secret?: string;        // Q&A normalized answer or recovery key hex (overrides identifier)
  salt?: string;          // Q&A question text (blob salt; defaults to userId from response)
  userId?: string | null; // fallback: used to generate a fresh bundle if no blob exists
}

interface KeyBundle {
  chat_master_key: string;
  signaling_secret_key: string;
}

const keyRecoveryService = new KeyRecoveryService();

/**
 * Attempts to recover the chat master key and signaling key from a recovery blob
 * during the forgot-password flow (no MainContainer / auth context available).
 *
 * Supports all four reset methods: SMS, email OTP, Q&A, and recovery key.
 * V2 blobs include the signaling key (server-opaque); V1 blobs fall back to
 * a random signaling key (old messages on a new device will be unreadable).
 *
 * Returns a new wrapped_blob sent atomically with the password reset request
 * so the server can update the primary key bundle without requiring an access token.
 */
export const usePasswordResetKeyRecovery = ({
  identifier,
  method,
  recoveryToken,
  secret,
  salt,
  userId: fallbackUserId,
}: Params) => {
  const buildFreshBundle = async (uid: string, newPassword: string): Promise<string> => {
    const freshBundle: KeyBundle = {
      chat_master_key: encodeBase64(nacl.randomBytes(32)),
      signaling_secret_key: encodeBase64(nacl.randomBytes(32)),
    };
    const kek = await deriveKey(newPassword, uid, 200_000);
    const plaintext = new TextEncoder().encode(JSON.stringify(freshBundle));
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const ct = nacl.secretbox(plaintext, nonce, kek);
    return encodeBase64(new Uint8Array([...nonce, ...ct]));
  };

  const attemptBuildWrappedBlob = async (params: {
    newPassword: string;
  }): Promise<string | null> => {
    if (!recoveryToken) {
      authLog.info("[usePasswordResetKeyRecovery] no recovery token — skipping", { method });
      return null;
    }

    try {
      const { newPassword } = params;
      const blobMethod = BLOB_METHODS[method];
      if (!blobMethod) {
        authLog.warn("[usePasswordResetKeyRecovery] unknown method", { method });
        return null;
      }

      // ── 1. Fetch the recovery blob ───────────────────────────────────────
      let blobRes: Awaited<ReturnType<typeof fetchRecoveryBlobApi>>;
      try {
        blobRes = await fetchRecoveryBlobApi(recoveryToken, blobMethod);
      } catch (fetchErr: unknown) {
        const is404 =
          fetchErr !== null &&
          typeof fetchErr === "object" &&
          "response" in fetchErr &&
          (fetchErr as { response?: { status?: number } }).response?.status === 404;

        if (is404 && fallbackUserId) {
          // No blob stored for this method (e.g. account predates blob setup).
          // Generate a fresh bundle so the wrapped key is updated with the new
          // password and the user is not locked out after reset.
          authLog.warn("[usePasswordResetKeyRecovery] blob not found — generating fresh bundle", { method });
          return buildFreshBundle(fallbackUserId, newPassword);
        }
        throw fetchErr;
      }

      const { wrapped_blob, user_id: userId } = blobRes.data;

      // ── 2. Derive wrapping key ───────────────────────────────────────────
      // blob secret: Q&A answer / recovery key hex, or identifier (phone/email)
      // blob salt: Q&A question text, or userId for all other methods
      const blobSecret = secret ?? identifier;
      const saltValue = salt ?? userId;
      const iterations = ITERATIONS[method] ?? 200_000;

      const wrappingKey = await keyRecoveryService.deriveWrappingKey(
        blobSecret,
        saltValue,
        iterations
      );

      // ── 3. Unwrap the key bundle ─────────────────────────────────────────
      const bundle = keyRecoveryService.unwrapKeyBundle(wrapped_blob, wrappingKey);
      if (!bundle) {
        authLog.warn("[usePasswordResetKeyRecovery] blob unwrap failed — wrong secret/salt", { method });
        return null;
      }

      const masterKey = bundle.masterKey;
      const signalingKey = bundle.signalingKey ?? nacl.randomBytes(32);

      authLog.info("[usePasswordResetKeyRecovery] key bundle unwrapped", {
        method,
        v2: Boolean(bundle.signalingKey),
      });

      // ── 4. Build new primary wrapped-key bundle ──────────────────────────
      const kek = await deriveKey(newPassword, userId, 200_000);
      const keyBundle: KeyBundle = {
        chat_master_key: encodeBase64(masterKey),
        signaling_secret_key: encodeBase64(signalingKey),
      };
      const plaintext = new TextEncoder().encode(JSON.stringify(keyBundle));
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const ct = nacl.secretbox(plaintext, nonce, kek);
      const newWrappedBlob = encodeBase64(new Uint8Array([...nonce, ...ct]));

      authLog.info("[usePasswordResetKeyRecovery] new wrapped blob built", { method });
      return newWrappedBlob;
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[usePasswordResetKeyRecovery] failed", { ...appErr, method });
      return null;
    }
  };

  return { attemptBuildWrappedBlob };
};
