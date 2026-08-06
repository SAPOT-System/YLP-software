'use client'

import UserTable from "@/ui/dashboard/user-table";
import { useState, useEffect, useRef } from 'react';
import { toast } from "sonner";
import {
  Loader,
  LoaderIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";

import EditUserModal from "@/ui/dashboard/edit-user-modal";
import { withBasePath } from "@/lib/basePath";

export default function Users() {
	const [data, setData] = useState<any | undefined>(undefined);

  const [page, setPage] = useState(1);

  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");

  // Initial loading only
  const [loading, setLoading] = useState(true);

  // Search spinner
  const [isSearching, setIsSearching] = useState(false);

  const [isOpen, setIsOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const size = 5;

  // =====================================================
  // DEBOUNCE SEARCH
  // =====================================================

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPage(1);
    }, 400);

    return () => clearTimeout(timer);
  }, [keyword]);

  // =====================================================
  // FETCH DATA
  // =====================================================

  async function fetchData() {
    try {
      setIsSearching(true);

      // Cancel previous request
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();

      abortRef.current = controller;

      const url = withBasePath(`/api/get-users-activity?keyword=${debouncedKeyword}&page=${page}&size=${size}`);

      const res = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error("Failed fetch");
      }

      const json = await res.json();

      if (json?.error) {
        throw new Error(json.error);
      }

      setData(json);

    } catch (err: any) {

      if (err.name !== "AbortError") {
        console.error(err);
        toast.error("Failed to fetch user activity");
      }

    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  }

  // =====================================================
  // FETCH ON PAGE / SEARCH CHANGE
  // =====================================================

  useEffect(() => {
    fetchData();

    return () => {
      abortRef.current?.abort();
    };
  }, [page, debouncedKeyword]);

  return (
    <div className="flex flex-col gap-4">

      {/* MODAL */}
      <EditUserModal
        isOpen={isOpen}
        user={null}
        mode="create"
        onClose={setIsOpen}
        onRefresh={fetchData}
      />

      {/* SEARCH */}
      <div className="grid grid-cols-5 gap-2">

        <div className="col-span-4 flex items-center gap-2 h-12 px-4 rounded-3xl bg-gray-100">

          {isSearching ? (
            <LoaderIcon className="w-5 animate-spin" />
          ) : (
            <SearchIcon className="w-5" />
          )}

          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full bg-transparent outline-none"
            placeholder="Search users..."
          />

        </div>

        <button
          className="flex items-center justify-center gap-2 text-white bg-blue-600 hover:bg-blue-500 rounded-3xl"
          onClick={() => setIsOpen(true)}
        >
          <PlusIcon />
          Add user
        </button>

      </div>

			{/* TABLE */}
			{loading || data === undefined ? (
				<div className="rounded-3xl p-6 flex items-center justify-center min-h-[400px] custom-white shadow-sm">

					<div className="flex flex-col items-center gap-3">

						<Loader
							size={22}
							className="animate-spin"
						/>

						<p className="text-sm text-gray-500">
							Loading users...
						</p>

					</div>

				</div>
			) : (
				<UserTable
					data={data?.items ?? []}
					currentPage={data?.page ?? 1}
					totalPages={data?.pages ?? 1}
					onPageChange={setPage}
					refreshData={fetchData}
				/>
			)}

    </div>
  );
}
