'use client'
import { secureFetch } from "@/api/fetch";
import GrayTopContainer from "@/ui/dashboard/gray-top-container";
import PacketLossChart from "@/ui/dashboard/packet-loss-chart";
import SpeedometerGauge from "@/ui/dashboard/speedometer";
import SummaryCard from "@/ui/dashboard/summary-card";
import WhiteContainer from "@/ui/dashboard/white-rounded-container";
import Link from "next/link";
import { useState, useEffect } from 'react';


export default function Dashboard() {
	const [nodeData, setNodeData] = useState({});
	const [currentLoss, setCurrentLoss] = useState(0);
	const [lossHistory, setLossHistory] = useState([]);

	useEffect(() => {
		const fetchData = async () => {
			try {
				// Call your NEXT.JS proxy, not the secureFetch directly
				const res = await fetch('/api/active-users'); 
				const data = await res.json();
				
				setNodeData(data);
			} catch (err) {
				console.error("Polling error:", err);
			}
		};

		fetchData();
		const interval = setInterval(fetchData, 3000);
		return () => clearInterval(interval);
	}, []);
  return (
		<div className="grid grid-cols-4 gap-2" >
			<div className="col-span-3 flex flex-col gap-2 row-span-full">
				<WhiteContainer style="">
					<SummaryCard label="Total Nodes" value={nodeData.total_users !== undefined ? nodeData.total_users : "Loading..."} />
					<SummaryCard label="Active Nodes" value={nodeData.active_users  !== undefined ? nodeData.active_users : "Loading..."}/>
					<SummaryCard label="Inactive Nodes" value={nodeData.inactive_users !== undefined ? nodeData.inactive_users : "Loading..."} />
					<Link href="#" key="view-nodes" className="text-white bg-blue-600 hover:bg-blue-500 transition-all duration-150 w-full rounded-3xl px-2 py-1 text-xl text-center font-medium">
						{ "View Nodes" }
					</Link>
				</WhiteContainer>
				<WhiteContainer style="items-stretch">
					<GrayTopContainer title="Download Speed">
						{/* Placed inside the Card component's child slot */}
						<SpeedometerGauge value={10} max={100} unit="Mbps" />
					</GrayTopContainer>

					<GrayTopContainer title="Upload Speed">
						{/* Placed inside the Card component's child slot */}
						<SpeedometerGauge value={4} max={100} unit="Mbps" />
					</GrayTopContainer>
					<GrayTopContainer title="Upload Speed">
						{/* Placed inside the Card component's child slot */}
						<PacketLossChart currentLoss={currentLoss} lossHistory={lossHistory} />
					</GrayTopContainer>

				</WhiteContainer>
			</div>
			<div className="flex flex-col gap-2 row-span-full">
				<WhiteContainer style="h-full"> active interfaces </WhiteContainer>
				<WhiteContainer style="h-full">status</WhiteContainer>
			</div>
		</div>
  );
}
