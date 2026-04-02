import {
  addColumns,
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
  ],
});
