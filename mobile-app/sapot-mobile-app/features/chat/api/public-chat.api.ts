import { apiClient } from "@/features/shared/api/client";
import { apiLog } from "@/features/shared/utils/logger";

apiLog.debug("[public-chat-api] module loaded");

interface PublicChatApiMessage {
  id: string;
  content: string;
  is_deleted: boolean;
  sender_id: string;
  created_at: number;
}

export interface PublicChatHistoryResponse {
  messages: PublicChatApiMessage[];
  limit: number;
  offset: number;
}

export async function fetchPublicChatHistory(
  limit: number,
  offset: number
): Promise<PublicChatHistoryResponse> {
  apiLog.debug("api › public-chat history fetch", { limit, offset });
  const res = await apiClient.get<PublicChatHistoryResponse>("/public-chat", {
    params: { limit, offset },
  });
  apiLog.info("api › public-chat history received", {
    count: res.data.messages.length,
    offset,
  });
  return res.data;
}
