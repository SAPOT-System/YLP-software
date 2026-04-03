'use client'
import { secureFetch } from "@/api/fetch";
import SummaryCard from "@/ui/dashboard/summary-card";
import Link from "next/link";
import { useState, useEffect } from 'react';


export default function Dashboard() {
	const [nodeData, setNodeData] = useState({});

	useEffect(() => {
		const fetchData = async () => {
			try {
				// Call your NEXT.JS proxy, not the secureFetch directly
				const res = await fetch('/api/active-users'); 
				const data = await res.json();
				
				setNodeData(data);
				console.log("DATA", data);
			} catch (err) {
				console.error("Polling error:", err);
			}
		};

		fetchData();
		const interval = setInterval(fetchData, 3000);
		return () => clearInterval(interval);
	}, []);
  return (
		<div className="flex w-full gap-2 items-center custom-white p-2 rounded-3xl border-gray-200 shadow-md">
			<SummaryCard label="Total Nodes" value={nodeData.total_users !== undefined ? nodeData.total_users : "Loading..."} />
			<SummaryCard label="Active Nodes" value={nodeData.active_users  !== undefined ? nodeData.active_users : "Loading..."}/>
			<SummaryCard label="Inactive Nodes" value={nodeData.inactive_users !== undefined ? nodeData.inactive_users : "Loading..."} />
			<Link href="#" key="view-nodes" className="text-white bg-blue-600 hover:bg-blue-500 transition-all duration-150 w-full rounded-3xl px-2 py-1 text-xl text-center font-medium">
				{ "View Nodes" }
			</Link>
		</div>
  );
}
