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
        { name: "peer_id", type: "string" },
        { name: "message", type: "string" },
        { name: "timestamp", type: "number" },
      ],
    }),
  ],
});
