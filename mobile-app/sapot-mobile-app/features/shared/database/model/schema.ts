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
        { name: "chat", type: "string" },
        { name: "sender", type: "string" },
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
        { name: "chat", type: "string" },
        { name: "peer", type: "string" },
        { name: "role", type: "string" },
        { name: "joined_at", type: "number" },
        { name: "created_at", type: "number" },
      ],
    }),
  ],
});
