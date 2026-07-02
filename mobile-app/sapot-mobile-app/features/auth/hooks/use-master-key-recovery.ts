import { toAppError } from "@/features/shared/core/errors";
import { authLog } from "@/features/shared/core/utils/logger";
import { useMainContainer } from "@/features/shared/hooks/use-main-container";
import { KeyRecoveryService, RecoveryMethod } from "@/features/shared/crypto/key-recovery-service";
import {
  fetchRecoveryBlobApi,
  updateRecoveryKeysApi,
  verifyRecoveryOtpApi,
  verifyEmailRecoveryTokenApi,
} from "../api/auth.api";

export const useMasterKeyRecovery = () => {
  const { localEncryptionService, keyRecoveryService } = useMainContainer();

  const proveIdentityByPhone = async (phone: string, otp: string) => {
    try {
      const res = await verifyRecoveryOtpApi(phone, otp);
      return { recovery_token: res.data.recovery_token, user_id: res.data.user_id };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useMasterKeyRecovery] proveIdentityByPhone failed", appErr);
      return null;
    }
  };

  const proveIdentityByEmailToken = async (t: string) => {
    try {
      const res = await verifyEmailRecoveryTokenApi(t);
      return { recovery_token: res.data.recovery_token, user_id: res.data.user_id };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useMasterKeyRecovery] proveIdentityByEmailToken failed", appErr);
      return null;
    }
  };

  const fetchAndUnwrapMasterKey = async (params: {
    recoveryToken: string;
    userId: string;
    method: RecoveryMethod;
    secret: string;
    salt: string;
    iterations: number;
  }) => {
    try {
      const res = await fetchRecoveryBlobApi(params.recoveryToken, params.method);
      const { wrapped_blob } = res.data;

      const wrappingKey = await keyRecoveryService.deriveWrappingKey(
        params.secret,
        params.salt,
        params.iterations
      );
      const bundle = keyRecoveryService.unwrapKeyBundle(wrapped_blob, wrappingKey);
      if (!bundle) {
        authLog.warn("[useMasterKeyRecovery] unwrap failed — wrong key");
        return { success: false };
      }

      await localEncryptionService.setMasterKey(bundle.masterKey);
      return { success: true };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useMasterKeyRecovery] fetchAndUnwrapMasterKey failed", appErr);
      return { success: false };
    }
  };

  const rewrapAllBlobs = async (params: {
    userId: string;
    newPassword: string;
    phone?: string;
    email?: string;
    questionText?: string;
    answer?: string;
    tokenHex?: string;
  }) => {
    try {
      const masterKey = localEncryptionService.getMasterKeyBytes();
      const signalingKey = localEncryptionService.getSignalingSecretKey();

      // Update primary password-wrapped key used by LocalEncryptionService
      await localEncryptionService.updateMasterKeyPassword(params.newPassword);

      const blobs: Array<{ method: RecoveryMethod; wrapped_blob: string; metadata?: string }> = [];

      blobs.push(await keyRecoveryService.wrapWithMethod(
        masterKey, "password", params.newPassword, params.userId, undefined, signalingKey
      ));

      if (params.phone) {
        blobs.push(await keyRecoveryService.wrapWithMethod(
          masterKey, "phone", params.phone, params.userId, undefined, signalingKey
        ));
      }
      if (params.email) {
        blobs.push(await keyRecoveryService.wrapWithMethod(
          masterKey, "email", params.email, params.userId, undefined, signalingKey
        ));
      }
      if (params.questionText && params.answer) {
        blobs.push(await keyRecoveryService.wrapWithMethod(
          masterKey, "qa",
          KeyRecoveryService.normalizeAnswer(params.answer),
          params.questionText,
          JSON.stringify({ question: params.questionText }),
          signalingKey
        ));
      }
      if (params.tokenHex) {
        blobs.push(await keyRecoveryService.wrapWithMethod(
          masterKey, "token", params.tokenHex, params.userId, undefined, signalingKey
        ));
      }

      await updateRecoveryKeysApi(
        blobs.map((b) => ({ method: b.method, wrapped_blob: b.wrapped_blob, metadata: b.metadata }))
      );
      return { success: true };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useMasterKeyRecovery] rewrapAllBlobs failed", appErr);
      return { success: false };
    }
  };

  return {
    proveIdentityByPhone,
    proveIdentityByEmailToken,
    fetchAndUnwrapMasterKey,
    rewrapAllBlobs,
  };
};
