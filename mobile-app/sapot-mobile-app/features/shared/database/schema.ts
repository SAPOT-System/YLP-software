import { appSchema, tableSchema } from "@nozbe/watermelondb";

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: "peers",
      columns: [
        { name: "username", type: "string" },
        { name: "is_online", type: "boolean" },
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
        { name: "edited_at", type: "number" },
        { name: "is_deleted", type: "boolean" },
      ],
    }),
    tableSchema({
      name: "message_status",
      columns: [
        { name: "message", type: "string" },
        { name: "user", type: "string" },
        { name: "status", type: "string" },
      ],
    }),
    tableSchema({
      name: "conversations",
      columns: [
        { name: "type", type: "string" },
        { name: "created_at", type: "number" },
        { name: "is_deleted", type: "boolean" },
      ],
    }),
    tableSchema({
      name: "conversation_participants",
      columns: [
        { name: "conversation", type: "string" },
        { name: "user", type: "string" },
        { name: "role", type: "string" },
        { name: "joined_at", type: "number" },
        { name: "is_deleted", type: "boolean" },
      ],
    }),
  ],
});
