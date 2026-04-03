import {
  addColumns,
  createTable,
  schemaMigrations,
} from "@nozbe/watermelondb/Schema/migrations";

export default schemaMigrations({
  migrations: [
    // We'll add migration definitions here later
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: "peers",
          columns: [
            {
              name: "email_verified",
              type: "boolean",
              isOptional: true,
            },
          ],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: "messages",
          columns: [
            { name: "updated_at", type: "number" },
          ],
        }),
        addColumns({
          table: "conversations",
          columns: [
            { name: "updated_at", type: "number" },
            { name: "title", type: "string", isOptional: true },
          ],
        }),
        createTable({
          name: "message_receipts",
          columns: [
            { name: "message", type: "string" },
            { name: "user", type: "string" },
            { name: "status", type: "string" },
            { name: "updated_at", type: "number" },
          ],
        }),
        createTable({
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
        createTable({
          name: "call_participants",
          columns: [
            { name: "call", type: "string" },
            { name: "user", type: "string" },
            { name: "joined_at", type: "number" },
            { name: "left_at", type: "number", isOptional: true },
          ],
        }),
      ],
    },
  ],
});
