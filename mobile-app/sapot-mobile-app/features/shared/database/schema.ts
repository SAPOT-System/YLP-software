import { appSchema, tableSchema } from "@nozbe/watermelondb";

export default appSchema({
  version: 5,
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
      ],
    }),
    tableSchema({
      name: "call_participants",
      columns: [
        { name: "call", type: "string" },
        { name: "user", type: "string" },
        { name: "joined_at", type: "number" },
        { name: "left_at", type: "number", isOptional: true },
      ],
    }),
    tableSchema({
      name: "message_receipts",
      columns: [
        { name: "message", type: "string" },
        { name: "user", type: "string" },
        { name: "status", type: "string" },
        { name: "updated_at", type: "number" },
      ],
    }),
    tableSchema({
      name: "conversations",
      columns: [
        { name: "type", type: "string" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
        { name: "title", type: "string", isOptional: true },
      ],
    }),
    tableSchema({
      name: "conversation_participants",
      columns: [
        { name: "conversation", type: "string" },
        { name: "user", type: "string" },
        { name: "joined_at", type: "number" },
        { name: "is_deleted", type: "boolean" },
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
