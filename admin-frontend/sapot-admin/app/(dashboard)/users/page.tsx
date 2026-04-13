'use client'
import UserTable from "@/ui/dashboard/user-table";
import { useState, useEffect } from 'react';
import { toast } from "sonner";
import { getTime } from "../dashboard/page";
import MetricSkeleton from "@/ui/dashboard/skeleton";
import { LoaderIcon, PlusIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import Modal from "@/ui/dashboard/popup";

export default function Users() {
	const [userActivityData, setUserActivityData] = useState({});
	const [page, setPage] = useState(1);
	const [isMounted, setIsMounted] = useState(false);
	const [keyword, setKeyword] = useState("");
	const [isSearching, setIsSearching] = useState(false);
	const size = 5;

	useEffect(()=> {
		(async ()=>{
			try {
				const url = `/api/get-users-activity?keyword=${keyword}&page=${page}&size=${size}`;
				const fetchUserActivity = await fetch(url); 
				console.log("URL", fetchUserActivity)
				const userData = await fetchUserActivity.json();
				if (userData.error) 
					throw Error("Failed to fetch user activity");
				setIsMounted(true);
				setUserActivityData(userData)
				console.log("fetched", userData);
				setIsMounted(true);
				setIsSearching(false)
			} catch {
				toast.error("Failed to fetch user activity data.")
				setIsMounted(false);
			}
		})()
		console.log("KEYWORD", keyword)
	}, [page, keyword])

	useEffect(()=> {
		setIsSearching(true);
	}, [keyword])

	if (!isMounted || !userActivityData ) {
		return <div className="flex flex-row items-stretch gap-6 p-10">
	       <MetricSkeleton />
	     </div>
	 }
	 console.log(userActivityData)
	return ( 
					<div className="flex flex-col gap-2">
							<div className="grid grid-cols-5 gap-2">
								<div className="custom-gray col-span-4 flex items-center gap-1 h-12 p-5 rounded-3xl">
								{
									isSearching ? <LoaderIcon className="w-5"/> : <SearchIcon className="w-5"/>
								}
										<input onChange={(e)=>setKeyword(e.target.value)} className="w-full outline-none focus:border-none "/>
								</div>
								<div key="view-nodes" className="flex gap-1 items-center justify-center text-white cursor-pointer bg-blue-600 hover:bg-blue-500 transition-all duration-150 rounded-3xl px-1 py-1 text-center">
								<PlusIcon/>{ "Add user" }
								</div>
						</div>
						<UserTable 
											data={userActivityData.items || []} 
											onPageChange={(newPage) => setPage(newPage)}
											currentPage={userActivityData.page} 
											totalPages={userActivityData.pages}
										/>
										<Modal>
											<h1>hi world</h1>

										</Modal>
					</div>
  );
}
