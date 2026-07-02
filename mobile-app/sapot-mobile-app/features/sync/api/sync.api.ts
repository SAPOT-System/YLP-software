import {
  apiClient,
  CallStatus,
  CallType,
  ConversationType,
  MessageStatusType,
  MessageType,
} from "@/features/shared";
import { apiLog } from "@/features/shared/core/utils/logger";
apiLog.debug("[sync-api] module loaded");

interface ServerEntityPage<T extends object, U extends object> {
  created: T[];
  updated: U[];
  deleted: string[];
  has_more: boolean;
  next_cursor: number | null;
}

export interface ServerSyncResponse {
  changes: {
    conversations: ServerEntityPage<
      PushLocalDataRequestBody["changes"]["conversations"]["created"][number],
      PushLocalDataRequestBody["changes"]["conversations"]["updated"][number]
    >;
    conversation_participants: ServerEntityPage<
      PushLocalDataRequestBody["changes"]["conversation_participants"]["created"][number],
      PushLocalDataRequestBody["changes"]["conversation_participants"]["updated"][number]
    >;
    messages: ServerEntityPage<
      PushLocalDataRequestBody["changes"]["messages"]["created"][number],
      PushLocalDataRequestBody["changes"]["messages"]["updated"][number]
    >;
    calls: ServerEntityPage<
      PushLocalDataRequestBody["changes"]["calls"]["created"][number],
      PushLocalDataRequestBody["changes"]["calls"]["updated"][number]
    >;
    call_participants: ServerEntityPage<
      PushLocalDataRequestBody["changes"]["call_participants"]["created"][number],
      PushLocalDataRequestBody["changes"]["call_participants"]["updated"][number]
    >;
    message_receipts: ServerEntityPage<
      PushLocalDataRequestBody["changes"]["message_receipts"]["created"][number],
      PushLocalDataRequestBody["changes"]["message_receipts"]["updated"][number]
    >;
  };
  timestamp: number;
}

export const sync = async (lastPulledAt: number, schemaVersion: number) => {
  apiLog.info("api › sync pull", { lastPulledAt, schemaVersion });
  const res = await apiClient.get<ServerSyncResponse>("/sync/pull", {
    params: { last_pulled_at: lastPulledAt, schema_version: schemaVersion },
  });
  return res;
};

export interface PushLocalDataRequestBody {
  last_pulled_at?: number;
  changes: {
    conversations: {
      created: {
        id: string;
        title: string | null;
        conversation_type: ConversationType;
        is_deleted: boolean;
        created_at: string | number;
        updated_at: string | number;
      }[];
      updated: {
        id: string;
        title?: string | null;
        conversation_type?: ConversationType;
        is_deleted?: boolean;
        created_at?: string | number;
        updated_at?: string | number;
      }[];
      deleted: string[];
    };
    conversation_participants: {
      created: {
        id?: string;
        conversation_id: string;
        user_id: string;
        joined_at: string | number;
        is_deleted: boolean;
        created_at: string | number;
        updated_at: string | number;
      }[];
      updated: {
        id?: string;
        conversation_id: string;
        user_id: string;
        joined_at?: string | number;
        is_deleted?: boolean;
        created_at?: string | number;
        updated_at?: string | number;
      }[];
      deleted: string[];
    };
    messages: {
      created: {
        id: string;
        conversation_id: string;
        sender_id: string;
        content: string;
        message_type: MessageType;
        is_deleted: boolean;
        created_at: string | number;
        updated_at: string | number;
      }[];
      updated: {
        id: string;
        conversation_id?: string;
        sender_id?: string;
        content?: string;
        message_type?: MessageType;
        is_deleted?: boolean;
        created_at?: string | number;
        updated_at?: string | number;
      }[];
      deleted: string[];
    };
    calls: {
      created: {
        id: string;
        call_type: CallType;
        status: CallStatus;
        start_time: string | number;
        end_time: string | number;
        conversation_id: string;
        initiator_id: string;
        is_deleted: boolean;
        created_at: string | number;
        updated_at: string | number;
      }[];
      updated: {
        id: string;
        call_type?: CallType;
        status?: CallStatus;
        start_time?: string | number;
        end_time?: string | number;
        conversation_id?: string;
        initiator_id?: string;
        is_deleted?: boolean;
        created_at?: string | number;
        updated_at?: string | number;
      }[];
      deleted: string[];
    };
    call_participants: {
      created: {
        id: string;
        call_id: string;
        user_id: string;
        joined_at: string | number;
        left_at: string | number | null;
        is_deleted: boolean;
        created_at: string | number;
        updated_at: string | number;
      }[];
      updated: {
        id: string;
        call_id?: string;
        user_id?: string;
        joined_at?: string | number;
        left_at?: string | null | number;
        is_deleted?: boolean;
        created_at?: string | number;
        updated_at?: string | number;
      }[];
      deleted: string[];
    };
    message_receipts: {
      created: {
        id: string;
        status: MessageStatusType;
        message_id: string;
        user_id: string;
        is_deleted: boolean;
        created_at: string | number;
        updated_at: string | number;
      }[];
      updated: {
        id: string;
        status?: MessageStatusType;
        message_id?: string;
        user_id?: string;
        is_deleted?: boolean;
        created_at?: string | number;
        updated_at?: string | number;
      }[];
      deleted: string[];
    };
  };
  guest_users?: Record<string, {
    first_name: string;
    last_name: string;
    username: string;
  }>;
}

interface PushLocalDataResponse {
  status: "ok";
}

export const pushLocalDataApi = async (data: PushLocalDataRequestBody) => {
  apiLog.info("api › sync push", {
    hasChanges: Boolean(data?.changes),
  });
  const res = await apiClient.post<PushLocalDataResponse>("/sync/push", data);
  return res;
};
