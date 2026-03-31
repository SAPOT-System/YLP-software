import {
  addColumns,
  schemaMigrations,
} from "@nozbe/watermelondb/Schema/migrations";

export default schemaMigrations({
  migrations: [
    // We'll add migration definitions here later
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: "peers",
          columns: [
            {
              name: "first_name",
              type: "string",
            },
            {
              name: "last_name",
              type: "string",
              isOptional: true,
            },
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
          ],
        }),
      ],
    },
  ],
});
