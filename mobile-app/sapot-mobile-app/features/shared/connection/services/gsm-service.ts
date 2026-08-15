import {
  contactUnknownUser,
  getGsmHealth,
  sendSmsToUser,
} from "@/features/shared/core/api/gsm.api";

export class GsmService {
  getHealth() {
    return getGsmHealth();
  }

  sendSmsToUser(userId: string, message: string) {
    return sendSmsToUser(userId, message);
  }

  contactUnknownUser(targetPhoneNumber: string) {
    return contactUnknownUser(targetPhoneNumber);
  }
}
