import { syncLog } from "@/features/shared/utils/logger";
import type {
  PushLocalDataRequestBody,
} from "../api/sync.api";
import type { SyncEntity, EntityLocalPayloadMap } from "./sync-service";

export class SyncPayloadBuilder {
  toServerPayload(
    entity: "conversations",
    payload: EntityLocalPayloadMap["conversations"]
  ):
    | PushLocalDataRequestBody["changes"]["conversations"]["created"][number]
    | PushLocalDataRequestBody["changes"]["conversations"]["updated"][number];
  toServerPayload(
    entity: "conversation_participants",
    payload: EntityLocalPayloadMap["conversation_participants"]
  ):
    | PushLocalDataRequestBody["changes"]["conversation_participants"]["created"][number]
    | PushLocalDataRequestBody["changes"]["conversation_participants"]["updated"][number];
  toServerPayload(
    entity: "messages",
    payload: EntityLocalPayloadMap["messages"]
  ):
    | PushLocalDataRequestBody["changes"]["messages"]["created"][number]
    | PushLocalDataRequestBody["changes"]["messages"]["updated"][number];
  toServerPayload(
    entity: "calls",
    payload: EntityLocalPayloadMap["calls"]
  ):
    | PushLocalDataRequestBody["changes"]["calls"]["created"][number]
    | PushLocalDataRequestBody["changes"]["calls"]["updated"][number];
  toServerPayload(
    entity: "call_participants",
    payload: EntityLocalPayloadMap["call_participants"]
  ):
    | PushLocalDataRequestBody["changes"]["call_participants"]["created"][number]
    | PushLocalDataRequestBody["changes"]["call_participants"]["updated"][number];
  toServerPayload(
    entity: "message_receipts",
    payload: EntityLocalPayloadMap["message_receipts"]
  ):
    | PushLocalDataRequestBody["changes"]["message_receipts"]["created"][number]
    | PushLocalDataRequestBody["changes"]["message_receipts"]["updated"][number];
  toServerPayload(
    entity: SyncEntity,
    payload: EntityLocalPayloadMap[SyncEntity]
  ) {
    const toInt = (value: unknown, fallback = 0): number => {
      const n =
        typeof value === "number"
          ? value
          : typeof value === "string"
          ? Number(value)
          : NaN;
      return Number.isFinite(n) ? Math.trunc(n) : fallback;
    };

    switch (entity) {
      case "conversations": {
        const data = payload as EntityLocalPayloadMap["conversations"];
        const created_at = toInt(data.created_at ?? data.createdAt);
        const updated_at = toInt(data.updated_at ?? data.updatedAt);
        this.validateTimestamp(
          entity,
          data.id as string,
          created_at,
          "created_at"
        );
        this.validateTimestamp(
          entity,
          data.id as string,
          updated_at,
          "updated_at"
        );
        return {
          id: data.id as string,
          title: (data.title ?? "") as string | null,
          conversation_type: data.conversation_type ?? data.type,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at,
          updated_at,
        };
      }
      case "conversation_participants": {
        const data =
          payload as EntityLocalPayloadMap["conversation_participants"];
        const conversation_id = data.conversation_id ?? data.conversation;
        const user_id = data.user_id ?? data.user;
        this.validateForeignKey(
          entity,
          data.id as string,
          conversation_id,
          "conversation_id"
        );
        this.validateForeignKey(entity, data.id as string, user_id, "user_id");
        const joined_at = toInt(data.joined_at ?? data.joinedAt);
        const created_at = toInt(data.created_at ?? data.createdAt);
        const updated_at = toInt(data.updated_at ?? data.updatedAt);
        return {
          id: data.id,
          conversation_id,
          user_id,
          joined_at,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at,
          updated_at,
        };
      }
      case "messages": {
        const data = payload as EntityLocalPayloadMap["messages"];
        const conversation_id = data.conversation_id ?? data.conversation;
        const sender_id = data.sender_id ?? data.sender;
        this.validateForeignKey(
          entity,
          data.id as string,
          conversation_id,
          "conversation_id"
        );
        this.validateForeignKey(
          entity,
          data.id as string,
          sender_id,
          "sender_id"
        );
        const created_at = toInt(data.created_at ?? data.createdAt);
        const updated_at = toInt(data.updated_at ?? data.updatedAt);
        return {
          id: data.id as string,
          conversation_id,
          sender_id,
          message_type: data.message_type ?? data.messageType,
          content: data.content as string,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at,
          updated_at,
        };
      }
      case "calls": {
        const data = payload as EntityLocalPayloadMap["calls"];
        const conversation_id = data.conversation_id ?? data.conversation;
        const initiator_id = data.initiator_id ?? data.initiator;
        this.validateForeignKey(
          entity,
          data.id as string,
          conversation_id,
          "conversation_id"
        );
        this.validateForeignKey(
          entity,
          data.id as string,
          initiator_id,
          "initiator_id"
        );
        const start_time = toInt(data.start_time ?? data.startTime);
        const end_time = toInt(data.end_time ?? data.endTime);
        const created_at = toInt(data.created_at ?? data.createdAt);
        const updated_at = toInt(data.updated_at ?? data.updatedAt);
        this.validateTimestamp(
          entity,
          data.id as string,
          start_time,
          "start_time"
        );
        return {
          id: data.id as string,
          call_type: data.call_type ?? data.callType,
          status: data.status,
          start_time,
          end_time,
          conversation_id,
          initiator_id,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at,
          updated_at,
        };
      }
      case "call_participants": {
        const data = payload as EntityLocalPayloadMap["call_participants"];
        const call_id = data.call_id ?? data.call;
        const user_id = data.user_id ?? data.user;
        this.validateForeignKey(
          entity,
          data.id as string,
          call_id,
          "call_id"
        );
        this.validateForeignKey(entity, data.id as string, user_id, "user_id");
        const joined_at = toInt(data.joined_at ?? data.joinedAt);
        const left_at = toInt(data.left_at ?? data.leftAt);
        const created_at = toInt(data.created_at ?? data.createdAt);
        const updated_at = toInt(data.updated_at ?? data.updatedAt);
        return {
          id: data.id as string,
          call_id,
          user_id,
          joined_at,
          left_at,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at,
          updated_at,
        };
      }
      case "message_receipts": {
        const data = payload as EntityLocalPayloadMap["message_receipts"];
        const message_id = data.message_id ?? data.message;
        const user_id = data.user_id ?? data.user;
        this.validateForeignKey(
          entity,
          data.id as string,
          message_id,
          "message_id"
        );
        this.validateForeignKey(entity, data.id as string, user_id, "user_id");
        const created_at = toInt(data.created_at ?? data.createdAt);
        const updated_at = toInt(data.updated_at ?? data.updatedAt);
        return {
          id: data.id as string,
          status: data.status,
          message_id,
          user_id,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at,
          updated_at,
        };
      }
      default:
        return payload;
    }
  }

  private validateForeignKey(
    entity: string,
    id: string,
    fkField: unknown,
    fkFieldName: string
  ): void {
    if (!fkField) {
      syncLog.warn("sync › missing foreign key", {
        entity,
        recordId: id,
        field: fkFieldName,
        value: fkField,
      });
    }
  }

  private validateTimestamp(
    entity: string,
    id: string,
    timestamp: number,
    fieldName: string
  ): void {
    if (!Number.isFinite(timestamp) || timestamp === 0) {
      syncLog.warn("sync › invalid timestamp", {
        entity,
        recordId: id,
        field: fieldName,
        value: timestamp,
      });
    }
  }
}
