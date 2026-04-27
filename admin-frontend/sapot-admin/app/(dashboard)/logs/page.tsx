'use client'
import ReusableTable from "@/ui/dashboard/reusable-table";

export default function Logs() {
  const columns = [
    { header: "Name", key: "name" },
    { header: "Email", key: "email" },
  ];

  const data = [
    { name: "John", email: "john@example.com" },
    { name: "Jane", email: "jane@example.com" },
  ];

  return (
    <ReusableTable columns={columns} data={data}/>
  );
}
