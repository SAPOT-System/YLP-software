import { toAppError, captureAppError } from "@/features/shared/errors";
import { authLog } from "@/features/shared/utils/logger";
import { useMainContainer } from "@/features/shared/hooks/use-main-container";
import { KeyRecoveryService, RecoveryMethod } from "@/features/shared/services/key-recovery-service";
import { saveRecoveryTokenHex } from "@/features/shared/stores/secure-config";
import { setupRecoveryKeysApi, updateRecoveryKeysApi } from "../api/auth.api";

interface SetupParams {
  userId: string;
  password: string;
  phone?: string;
  email?: string;
  questionText?: string;
  answer?: string;
  enableToken?: boolean;
}

export const useRecoveryKeySetup = () => {
  const mainContainer = useMainContainer();
  const { localEncryptionService, keyRecoveryService } = mainContainer;

  const getUserId = (): string =>
    mainContainer.userContainer.sessionStore.userId;

  const setup = async (params: SetupParams) => {
    authLog.info("[useRecoveryKeySetup] setup called");
    try {
      const masterKey = localEncryptionService.getMasterKeyBytes();
      const signalingKey = localEncryptionService.getSignalingSecretKey();
      const blobs: Array<{ method: RecoveryMethod; wrapped_blob: string; metadata?: string }> = [];

      const passwordBlob = await keyRecoveryService.wrapWithMethod(
        masterKey, "password", params.password, params.userId, undefined, signalingKey
      );
      blobs.push(passwordBlob);

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
          masterKey,
          "qa",
          KeyRecoveryService.normalizeAnswer(params.answer),
          params.questionText,
          JSON.stringify({ question: params.questionText }),
          signalingKey
        ));
      }

      let recoveryTokenHex: string | undefined;
      if (params.enableToken) {
        const { hex } = KeyRecoveryService.generateRecoveryToken();
        recoveryTokenHex = hex;
        blobs.push(await keyRecoveryService.wrapWithMethod(
          masterKey, "token", hex, params.userId, undefined, signalingKey
        ));
        await saveRecoveryTokenHex(hex);
      }

      await setupRecoveryKeysApi(
        blobs.map((b) => ({
          method: b.method,
          wrapped_blob: b.wrapped_blob,
          metadata: b.metadata,
        }))
      );

      return { success: true, recoveryTokenHex };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useRecoveryKeySetup] setup failed", appErr);
      return { success: false };
    }
  };

  const setupQABlob = async (questionText: string, answer: string) => {
    try {
      const masterKey = localEncryptionService.getMasterKeyBytes();
      const signalingKey = localEncryptionService.getSignalingSecretKey();
      const qaBlob = await keyRecoveryService.wrapWithMethod(
        masterKey,
        "qa",
        KeyRecoveryService.normalizeAnswer(answer),
        questionText,
        JSON.stringify({ question: questionText }),
        signalingKey
      );
      await updateRecoveryKeysApi([{
        method: qaBlob.method,
        wrapped_blob: qaBlob.wrapped_blob,
        metadata: qaBlob.metadata,
      }]);
      authLog.info("[useRecoveryKeySetup] QA blob upserted");
      return { success: true };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useRecoveryKeySetup] setupQABlob failed", appErr);
      return { success: false };
    }
  };

  const setupPhoneBlob = async (phone: string) => {
    try {
      const userId = getUserId();
      const masterKey = localEncryptionService.getMasterKeyBytes();
      const signalingKey = localEncryptionService.getSignalingSecretKey();
      const blob = await keyRecoveryService.wrapWithMethod(
        masterKey, "phone", phone, userId, undefined, signalingKey
      );
      await updateRecoveryKeysApi([{
        method: blob.method,
        wrapped_blob: blob.wrapped_blob,
        metadata: blob.metadata,
      }]);
      authLog.info("[useRecoveryKeySetup] phone blob upserted");
      return { success: true };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useRecoveryKeySetup] setupPhoneBlob failed", appErr);
      return { success: false };
    }
  };

  const setupEmailBlob = async (email: string) => {
    try {
      const userId = getUserId();
      const masterKey = localEncryptionService.getMasterKeyBytes();
      const signalingKey = localEncryptionService.getSignalingSecretKey();
      const blob = await keyRecoveryService.wrapWithMethod(
        masterKey, "email", email, userId, undefined, signalingKey
      );
      await updateRecoveryKeysApi([{
        method: blob.method,
        wrapped_blob: blob.wrapped_blob,
        metadata: blob.metadata,
      }]);
      authLog.info("[useRecoveryKeySetup] email blob upserted");
      return { success: true };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useRecoveryKeySetup] setupEmailBlob failed", appErr);
      return { success: false };
    }
  };

  const setupTokenBlob = async (keyText: string) => {
    try {
      const userId = getUserId();
      const masterKey = localEncryptionService.getMasterKeyBytes();
      const signalingKey = localEncryptionService.getSignalingSecretKey();
      const blob = await keyRecoveryService.wrapWithMethod(
        masterKey, "token", keyText, userId, undefined, signalingKey
      );
      await updateRecoveryKeysApi([{
        method: blob.method,
        wrapped_blob: blob.wrapped_blob,
        metadata: blob.metadata,
      }]);
      authLog.info("[useRecoveryKeySetup] token blob upserted");
      return { success: true };
    } catch (error) {
      const appErr = toAppError(error, "auth");
      authLog.error("[useRecoveryKeySetup] setupTokenBlob failed", appErr);
      return { success: false };
    }
  };

  return { setup, setupQABlob, setupPhoneBlob, setupEmailBlob, setupTokenBlob };
};
