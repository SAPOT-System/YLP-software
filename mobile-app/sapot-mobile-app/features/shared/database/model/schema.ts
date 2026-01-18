import { appSchema, tableSchema } from "@nozbe/watermelondb";

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: "peers",
      columns: [
        { name: "username", type: "string" },
        { name: "port", type: "number" },
        { name: "ip_address", type: "string" },
        { name: "is_online", type: "boolean" },
      ],
    }),
    tableSchema({
      name: "messages",
      columns: [
        { name: "chat_id", type: "string" },
        { name: "sender_id", type: "string" },
        { name: "message", type: "string" },
        { name: "status", type: "string" },
        { name: "created_at", type: "number" },
      ],
    }),
    tableSchema({
      name: "chats",
      columns: [
        { name: "type", type: "string" },
        // { name: "name", type: "string", isOptional: true },
        // { name: "unreadCount", type: "number" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
      ],
    }),
    tableSchema({
      name: "participants",
      columns: [
        { name: "chat_id", type: "string" },
        { name: "peer_id", type: "string" },
        { name: "role", type: "string" },
        { name: "joined_at", type: "number" },
        { name: "created_at", type: "number" },
      ],
    }),
  ],
});
