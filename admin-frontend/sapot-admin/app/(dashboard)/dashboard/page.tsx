'use client'
import { secureFetch } from "@/api/fetch";
import GrayTopContainer from "@/ui/dashboard/gray-top-container";
import PacketLossChart from "@/ui/dashboard/packet-loss-chart";
import MetricSkeleton from "@/ui/dashboard/skeleton";
import SpeedometerGauge from "@/ui/dashboard/speedometer";
import SummaryCard from "@/ui/dashboard/summary-card";
import UserTable from "@/ui/dashboard/user-table";
import WhiteContainer from "@/ui/dashboard/white-rounded-container";
import Link from "next/link";
import { useState, useEffect } from 'react';


export default function Dashboard() {
	const [nodeData, setNodeData] = useState({});
	const [userActivityData, setUserActivityData] = useState([]);
	const [nicData, setNicData] = useState({});
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


				const fetchNIC = await fetch('/api/get-interfaces'); 
				const nicData = await fetchNIC.json();
				const activeInterfaces = Object.fromEntries(
					Object.entries(nicData).filter(([name, info]) => info.status === "up")
				);
				setNicData(activeInterfaces)

				const fetchUserActivity = await fetch('/api/get-users-activity'); 
				const userData = await fetchUserActivity.json();
				console.log(userData)
				setUserActivityData(userData)

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
		<div>
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
				<div className="col-span-1 flex flex-col gap-2 row-span-full w-full">
					<GrayTopContainer border={false} title="Active Interfaces" className="w-full h-full flex flex-col" classNameContent="flex flex-col h-full overflow-hidden"> 
							<div className="flex-1 w-full min-h-0 overflow-y-auto [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
									<div className="flex flex-col gap-2 w-full p-0">
											{Object.entries(nicData).map(data => (
													<div key={data[0]} className="border-b-gray-300 border-b p-4">
															<span className="font-bold">{data[0]}</span> {data[1].ipv4}
													</div>
											))}
											<div className="h-4" /> 
									</div>
							</div>
							<div className="flex-none border-t border-t-gray-300 custom-white w-full p-2 text-[#6B7280] text-center">
									<span className="text-center font-medium">
											Total Active: {Object.entries(nicData).length}
									</span>
							</div>

					</GrayTopContainer>
					<WhiteContainer style="h-full">Hi</WhiteContainer>
				</div>


			</div>

				<div className="col-span-1 flex flex-col gap-2 row-span-full w-full">
					<WhiteContainer style="h-full">
						<UserTable data={userActivityData}/>

					</WhiteContainer>
				</div>
		</div>
  );
}
