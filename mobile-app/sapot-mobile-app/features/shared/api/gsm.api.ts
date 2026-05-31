import { apiClient } from "@/features/shared/api/client";
import { apiLog } from "@/features/shared/utils/logger";

export type GsmHealthResponse = {
  status: string;
  gsm_ready: boolean;
  connected: boolean;
  detail: string;
};

export type SendSmsResponse = {
  msg_id: string;
  ok: boolean;
  to: string;
};

export type ContactUnknownUserResponse = {
  status: string;
  detail: string;
  user_id: string;
  is_sapot_user: boolean;
};

export const getGsmHealth = async (): Promise<GsmHealthResponse> => {
  apiLog.debug("api › gsm health");
  const res = await apiClient.get<GsmHealthResponse>("/gsm/health");
  return res.data;
};

export const sendSmsToUser = async (
  userId: string,
  message: string
): Promise<SendSmsResponse> => {
  apiLog.debug("api › gsm sms send", { userId });
  const res = await apiClient.post<SendSmsResponse>("/gsm/sms/send", null, {
    params: { user_id: userId, message },
  });
  return res.data;
};

export const contactUnknownUser = async (
  targetPhoneNumber: string
): Promise<ContactUnknownUserResponse> => {
  apiLog.debug("api › gsm contact unknown user", { targetPhoneNumber });
  const res = await apiClient.post<ContactUnknownUserResponse>(
    "/gsm/contact-unknown-user",
    null,
    { params: { target_phone_number: targetPhoneNumber } }
  );
  return res.data;
};
