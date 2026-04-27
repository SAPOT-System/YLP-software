'use client'

import UserTable from "@/ui/dashboard/user-table";
import { useState, useEffect, useRef } from 'react';
import { toast } from "sonner";
import MetricSkeleton from "@/ui/dashboard/skeleton";
import { LoaderIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import Modal from "@/ui/dashboard/modal";

export default function Users() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const size = 5;

  // ✅ Debounce (prevents spam requests)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPage(1);
    }, 400);

    return () => clearTimeout(timer);
  }, [keyword]);

  // ✅ Single fetch effect
  useEffect(() => {
    fetchData();
  }, [page, debouncedKeyword]);

  async function fetchData() {
    try {
      setLoading(true);
      setIsSearching(true);

      // ✅ Cancel previous request
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      const url = `/api/get-users-activity?keyword=${debouncedKeyword}&page=${page}&size=${size}`;

      const res = await fetch(url, {
        signal: controller.signal,
        cache: "no-store", // or "force-cache" if safe
      });

      const json = await res.json();

      if (!res.ok) throw new Error();

      setData(json);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast.error("Failed to fetch user activity");
      }
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex p-10">
        <MetricSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Search */}
      <div className="grid grid-cols-5 gap-2">
        <div className="col-span-4 flex items-center gap-2 h-12 px-4 rounded-3xl bg-gray-100">
          {isSearching ? <LoaderIcon className="w-5 animate-spin"/> : <SearchIcon className="w-5"/>}
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full bg-transparent outline-none"
            placeholder="Search users..."
          />
        </div>

        <button className="flex items-center justify-center gap-2 text-white bg-blue-600 hover:bg-blue-500 rounded-3xl">
          <PlusIcon /> Add user
        </button>
      </div>

      {/* Table */}
      <UserTable
        data={data?.items || []}
        currentPage={data?.page}
        totalPages={data?.pages}
        onPageChange={setPage}
        refreshData={fetchData}
      />
    </div>
  );
}
