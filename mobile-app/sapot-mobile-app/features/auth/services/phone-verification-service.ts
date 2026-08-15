import {
  migratePhoneUserApi,
  requestPhoneVerification,
  resendVerificationCodePhone,
  verifyCodePhone,
} from "@/features/auth/api/auth.api";

export class PhoneVerificationService {
  requestVerification(phone?: string, reauthToken?: string) {
    return requestPhoneVerification(phone, reauthToken);
  }

  verifyCode(code: string) {
    return verifyCodePhone(code);
  }

  resendCode() {
    return resendVerificationCodePhone();
  }

  migratePhoneUser() {
    return migratePhoneUserApi();
  }
}
