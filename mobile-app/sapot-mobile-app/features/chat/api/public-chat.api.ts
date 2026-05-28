import { apiClient } from "@/features/shared/api/client";
import { apiLog } from "@/features/shared/utils/logger";

apiLog.debug("[public-chat-api] module loaded");

interface PublicChatApiMessage {
  id: string;
  content: string;
  is_deleted: boolean;
  sender_id: string;
  sender_first_name: string | null;
  sender_last_name: string | null;
  sender_username: string | null;
  created_at: number;
}

export interface PublicChatHistoryResponse {
  messages: PublicChatApiMessage[];
  limit: number;
  oldest_created_at: number | null;
}

export async function fetchPublicChatHistory(
  limit: number,
  before?: number,
): Promise<PublicChatHistoryResponse> {
  apiLog.debug("api › public-chat history fetch", { limit, before });
  const res = await apiClient.get<PublicChatHistoryResponse>("/public-chat", {
    params: { limit, before },
  });
  apiLog.info("api › public-chat history received", {
    count: res.data.messages.length,
    before,
  });
  return res.data;
}
