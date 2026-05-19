import { appSchema, tableSchema } from "@nozbe/watermelondb";
import { schemaLog } from "../utils/logger";
schemaLog.debug("[database-schema] module loaded");

export default appSchema({
  version: 7,
  tables: [
    tableSchema(
      // For current guest user data:
      {
        name: "guest_user",
        columns: [
          { name: "first_name", type: "string" },
          { name: "last_name", type: "string" },
          { name: "username", type: "string" },
        ],
      }
    ),
    tableSchema({
      name: "peers",
      columns: [
        { name: "username", type: "string" },
        { name: "is_online", type: "boolean" },
        {
          name: "first_name",
          type: "string",
        },
        {
          name: "last_name",
          type: "string",
          isOptional: true,
        },
        // For current authenticated user data:
        {
          name: "email",
          type: "string",
          isOptional: true,
        },
        {
          name: "phone_number",
          type: "string",
          isOptional: true,
        },
        {
          name: "email_verified",
          type: "boolean",
          isOptional: true,
        },
        {
          name: "phone_number_verified",
          type: "boolean",
          isOptional: true,
        },
      ],
    }),
    tableSchema({
      name: "messages",
      columns: [
        { name: "conversation", type: "string" },
        { name: "sender", type: "string" },
        { name: "message_type", type: "string" },
        { name: "content", type: "string" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
        { name: "is_deleted", type: "boolean" },
      ],
    }),
    tableSchema({
      name: "calls",
      columns: [
        { name: "conversation", type: "string" },
        { name: "initiator", type: "string" },
        { name: "call_type", type: "string" },
        { name: "status", type: "string" },
        { name: "start_time", type: "number" },
        { name: "end_time", type: "number", isOptional: true },
        { name: "updated_at", type: "number" },
        { name: "created_at", type: "number" },
        { name: "is_deleted", type: "boolean" },
      ],
    }),
    tableSchema({
      name: "call_participants",
      columns: [
        { name: "call", type: "string" },
        { name: "user", type: "string" },
        { name: "joined_at", type: "number" },
        { name: "left_at", type: "number", isOptional: true },
        { name: "updated_at", type: "number" },
        { name: "created_at", type: "number" },
        { name: "is_deleted", type: "boolean" },
      ],
    }),
    tableSchema({
      name: "message_receipts",
      columns: [
        { name: "message", type: "string" },
        { name: "user", type: "string" },
        { name: "status", type: "string" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
        { name: "is_deleted", type: "boolean" },
      ],
    }),
    tableSchema({
      name: "conversations",
      columns: [
        { name: "type", type: "string" },
        { name: "title", type: "string", isOptional: true },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
        { name: "is_deleted", type: "boolean" },
      ],
    }),
    tableSchema({
      name: "conversation_participants",
      columns: [
        { name: "conversation", type: "string" },
        { name: "user", type: "string" },
        { name: "joined_at", type: "number" },
        { name: "is_deleted", type: "boolean" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
      ],
    }),
    // sync_queue table
    // id
    // type (send_message, read_receipt, delete_message)
    // payload
    // status
    // created_at
  ],
});
