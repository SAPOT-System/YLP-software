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
      ],
    }),
  ],
});
