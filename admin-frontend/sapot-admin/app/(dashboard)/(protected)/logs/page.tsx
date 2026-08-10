'use client'

import { ChevronLeft, ChevronRight } from "lucide-react";
import ReusableTable from "@/ui/dashboard/reusable-table";
import { useEffect, useState } from "react";
import Modal from "@/ui/dashboard/modal";
import { XIcon, SearchIcon } from "lucide-react";
import { withBasePath } from "@/lib/basePath";

type Log = {
  id: string;
  username: string;
  action: string;
  created_at: string;
  metadata_json: any;
  email?: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
};

export default function LogsPage() {
  const [data, setData] = useState<Log[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");

  const [selectedLog, setSelectedLog] = useState<Log | null>(null);

  const size = 10;

  // ✅ debounce search (prevents API spam)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPage(1); // reset page when searching
    }, 400);

    return () => clearTimeout(timer);
  }, [keyword]);

  async function fetchLogs() {
    try {
      setLoading(true);

      const res = await fetch(
        withBasePath(`/api/get-logs?page=${page}&size=${size}&keyword=${debouncedKeyword}`)
      );

      const json = await res.json();

      if (!res.ok) throw new Error(json.error || "Fetch failed");

      setData(json.items ?? []);
      setTotalPages(json.pages ?? 1);

    } catch (err) {
      console.error(err);
      setData([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }

  // ✅ refetch on page OR search
  useEffect(() => {
    fetchLogs();
  }, [page, debouncedKeyword]);

  // ✅ Table Columns
  const columns = [
    { header: "User", key: "username" },
    { header: "Action", key: "action" },
    {
      header: "Time",
      key: "created_at",
      render: (val: string) => new Date(val).toLocaleString(),
    },
    {
      header: "Details",
      key: "id",
      render: (_: any, row: Log) => (
        <button
          onClick={() => setSelectedLog(row)}
          className="text-blue-600 hover:underline"
        >
          View
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">

      {/* 🔍 SEARCH BAR */}
      <div className="flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-xl">
        <SearchIcon className="w-4 text-gray-500" />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Search logs..."
          className="w-full bg-transparent outline-none"
        />
      </div>

      {/* TABLE */}
      <ReusableTable
        columns={columns}
        data={data}
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage} // ✅ THIS is pagination hook
        isLoading={loading}
      />

      {/* MODAL */}
      {selectedLog && (
        <Modal>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">Log Details</h2>
            <XIcon
              className="w-5 cursor-pointer"
              onClick={() => setSelectedLog(null)}
            />
          </div>

          <div className="space-y-3 text-sm">
            <div><b>User:</b> {selectedLog.username}</div>
            <div><b>Email:</b> {selectedLog.email || "-"}</div>
            <div><b>Phone:</b> {selectedLog.phone_number || "-"}</div>
            <div><b>Name:</b> {selectedLog.first_name} {selectedLog.last_name}</div>
            <div><b>Action:</b> {selectedLog.action}</div>
            <div>
              <b>Time:</b>{" "}
              {new Date(selectedLog.created_at).toLocaleString()}
            </div>

            <div>
              <b>Metadata:</b>
              <pre className="bg-gray-100 p-3 rounded mt-1 overflow-x-auto text-xs">
                {JSON.stringify(selectedLog.metadata_json, null, 2)}
              </pre>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

