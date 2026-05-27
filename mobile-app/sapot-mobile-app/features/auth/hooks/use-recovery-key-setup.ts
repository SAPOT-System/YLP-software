import { authLog } from "@/features/shared/utils/logger";
import { useMainContainer } from "@/features/shared/hooks/use-main-container";
import { KeyRecoveryService, RecoveryMethod } from "@/features/shared/services/key-recovery-service";
import { saveRecoveryTokenHex } from "@/features/shared/stores/secure-config";
import { setupRecoveryKeysApi } from "../api/auth.api";

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
  const { localEncryptionService, keyRecoveryService } = useMainContainer();

  const setup = async (params: SetupParams) => {
    authLog.info("[useRecoveryKeySetup] setup called");
    try {
      const masterKey = localEncryptionService.getMasterKeyBytes();
      const blobs: Array<{ method: RecoveryMethod; wrapped_blob: string; metadata?: string }> = [];

      // password method
      const passwordBlob = await keyRecoveryService.wrapWithMethod(
        masterKey,
        "password",
        params.password,
        params.userId
      );
      blobs.push(passwordBlob);

      if (params.phone) {
        const phoneBlob = await keyRecoveryService.wrapWithMethod(
          masterKey,
          "phone",
          params.phone,
          params.userId
        );
        blobs.push(phoneBlob);
      }

      if (params.email) {
        const emailBlob = await keyRecoveryService.wrapWithMethod(
          masterKey,
          "email",
          params.email,
          params.userId
        );
        blobs.push(emailBlob);
      }

      if (params.questionText && params.answer) {
        const qaBlob = await keyRecoveryService.wrapWithMethod(
          masterKey,
          "qa",
          KeyRecoveryService.normalizeAnswer(params.answer),
          params.questionText,
          JSON.stringify({ question: params.questionText })
        );
        blobs.push(qaBlob);
      }

      let recoveryTokenHex: string | undefined;
      if (params.enableToken) {
        const { hex } = KeyRecoveryService.generateRecoveryToken();
        recoveryTokenHex = hex;
        const tokenBlob = await keyRecoveryService.wrapWithMethod(
          masterKey,
          "token",
          hex,
          params.userId
        );
        blobs.push(tokenBlob);
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
      authLog.error("[useRecoveryKeySetup] setup failed", { error });
      return { success: false };
    }
  };

  return { setup };
};
