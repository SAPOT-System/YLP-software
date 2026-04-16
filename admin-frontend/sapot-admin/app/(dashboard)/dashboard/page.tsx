'use client'
import { secureFetch } from "@/api/fetch";
import GrayTopContainer from "@/ui/dashboard/gray-top-container";
import PacketLossChart from "@/ui/dashboard/packet-loss-chart";
import MetricSkeleton from "@/ui/dashboard/skeleton";
import SpeedometerGauge from "@/ui/dashboard/speedometer";
import SummaryCard from "@/ui/dashboard/summary-card";
import WhiteContainer from "@/ui/dashboard/white-rounded-container";
import Link from "next/link";
import { useState, useEffect } from 'react';


export default function Dashboard() {
	const [nodeData, setNodeData] = useState({});
	const [netData, setNetData] = useState({});
	const [lossHistory, setLossHistory] = useState([]);
	const [isMounted, setIsMounted] = useState(false);
	useEffect(() => {
		const fetchData = async () => {
			try {
				// Call your NEXT.JS proxy, not the secureFetch directly
				const res = await fetch('/api/active-users'); 
				const data = await res.json();
				
				setNodeData(data);

				const fetchNetworkData = await fetch('/api/get-network-usage'); 
				const networkData = await fetchNetworkData.json();
				setNetData(networkData);
				const getTimeLabel = () => {
					return new Date().toLocaleTimeString([], { 
						hour: '2-digit', 
						minute: '2-digit', 
						second: '2-digit' 
					});
				};
				const newPoint = {
					time: getTimeLabel(),
					loss: networkData.loss_percent // The value from FastAPI
				};
				setLossHistory((prev) => {
					const updated = [...prev, newPoint];
					return updated.slice(-20); 
				});
				setIsMounted(true);
			} catch (err) {
				console.error("Polling error:", err);
			}
		};

		fetchData();
		const interval = setInterval(fetchData, 3000);
		return () => clearInterval(interval);
	}, []);
	if (!isMounted) {
		return <div className="flex flex-row items-stretch gap-6 p-10">
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
      </div>
  }
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
				<WhiteContainer style="items-stretch flex-wrap xl:flex-nowrap">
					<GrayTopContainer title="Download Speed">
						{/* Placed inside the Card component's child slot */}
						<SpeedometerGauge value={netData.download_mbps} max={100} unit="Mbps" />
					</GrayTopContainer>

					<GrayTopContainer title="Upload Speed">
						{/* Placed inside the Card component's child slot */}
						<SpeedometerGauge value={netData.upload_mbps !== undefined ? netData.upload_mbps : 0		} max={100} unit="Mbps" />
					</GrayTopContainer>
					<GrayTopContainer title="Packet Loss">
						{/* Placed inside the Card component's child slot */}
						<PacketLossChart currentLoss={netData.loss_percent !== undefined ? netData.loss_percent : 0} history={lossHistory} />
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
