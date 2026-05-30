import {
  addColumns,
  createTable,
  schemaMigrations,
} from "@nozbe/watermelondb/Schema/migrations";
import { migrationLog } from "../utils/logger";
migrationLog.debug("[database-migrations] module loaded");

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
          columns: [{ name: "updated_at", type: "number" }],
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
    {
      toVersion: 6,
      steps: [
        addColumns({
          table: "message_receipts",
          columns: [
            { name: "created_at", type: "number" },
            { name: "is_deleted", type: "boolean" },
          ],
        }),
        addColumns({
          table: "calls",
          columns: [
            { name: "created_at", type: "number" },
            { name: "is_deleted", type: "boolean" },
          ],
        }),
        addColumns({
          table: "call_participants",
          columns: [
            { name: "updated_at", type: "number" },
            { name: "created_at", type: "number" },
            { name: "is_deleted", type: "boolean" },
          ],
        }),
        addColumns({
          table: "conversations",
          columns: [{ name: "is_deleted", type: "boolean" }],
        }),
        addColumns({
          table: "conversation_participants",
          columns: [
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
          ],
        }),
      ],
    },
    {
      toVersion: 7,
      steps: [
        addColumns({
          table: "peers",
          columns: [
            {
              name: "phone_number_verified",
              type: "boolean",
              isOptional: true,
            },
          ],
        }),
      ],
    },
    {
      toVersion: 8,
      steps: [
        addColumns({
          table: "messages",
          columns: [
            { name: "linked_message_id", type: "string", isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 9,
      steps: [
        addColumns({
          table: "peers",
          columns: [{ name: "role", type: "string", isOptional: true }],
        }),
        addColumns({
          table: "messages",
          columns: [
            { name: "is_encrypted", type: "boolean", isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 10,
      steps: [
        addColumns({
          table: "peers",
          columns: [{ name: "is_guest", type: "boolean", isOptional: true }],
        }),
      ],
    },
  ],
});
