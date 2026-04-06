'use client'
import { secureFetch } from "@/api/fetch";
import GrayTopContainer from "@/ui/dashboard/gray-top-container";
import PacketLossChart from "@/ui/dashboard/packet-loss-chart";
import MetricSkeleton from "@/ui/dashboard/skeleton";
import SpeedometerGauge from "@/ui/dashboard/speedometer";
import StatusBadge from "@/ui/dashboard/status-badge";
import SummaryCard from "@/ui/dashboard/summary-card";
import UserTable from "@/ui/dashboard/user-table";
import WhiteContainer from "@/ui/dashboard/white-rounded-container";
import Link from "next/link";
import { useState, useEffect } from 'react';
import { toast } from "sonner";


export function getTime() {
	const date = new Date(); // Or your UTC string

	const humanTime = new Intl.DateTimeFormat('en-PH', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
		timeZone: 'Asia/Manila' // Ensures Bacoor time regardless of server location
	}).format(date);
	return humanTime;
}

export default function Dashboard() {
	const [nodeData, setNodeData] = useState({});
	const [nodeDataStatus, setNodeDataStatus] = useState({"val": false, "date": getTime()});
	const [page, setPage] = useState(1);
	const size = 5;
	const [userActivityData, setUserActivityData] = useState({});
	const [userActivityDataStatus, setUserActivityDataStatus] = useState({"val": false, "date": getTime()});
	const [nicData, setNicData] = useState({});
	const [nicDataStatus, setNicDataStatus] = useState({"val": false, "date": getTime()});
	const [netData, setNetData] = useState({});
	const [netDataStatus, setNetDataStatus] = useState({"val": false, "date": getTime()});
	const [lossHistory, setLossHistory] = useState([]);
	const [isMounted, setIsMounted] = useState(false);
	const [isMounted2, setIsMounted2] = useState(false);

	useEffect(() => {
		const fetchData = async () => {
			try {
				// Call your NEXT.JS proxy, not the secureFetch directly
				try {
					const res = await fetch('/api/active-users'); 
					const data = await res.json();
					if (data.error) 
						throw Error("Cannot fetch network data");
					setNodeData(data);
					setNodeDataStatus({"val": true, "date": getTime()})
				} catch {
					setNodeDataStatus({"val": false, "date": getTime()})
					toast.error("Failed to fetch active nodes data.")
				}
				

				try {
					const fetchNetworkData = await fetch('/api/get-network-usage'); 
					const networkData = await fetchNetworkData.json();

					console.log("NETWORKDATA", networkData);
					if (networkData.error) 
						throw Error("Cannot fetch network data");

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
					setNetDataStatus({"val": true, "date": getTime()})
				} catch {
					setNetDataStatus({"val": false, "date": getTime()})
					toast.error("Failed to fetch network data.")
				}

				try {
					const fetchNIC = await fetch('/api/get-interfaces'); 
					const nicData = await fetchNIC.json();
					if (nicData.error) {
						throw Error("Failse to fetch nic data")
					}
					const activeInterfaces = Object.fromEntries(
						Object.entries(nicData).filter(([name, info]) => info.status === "up")
					);
					setNicData(activeInterfaces)
					setNicDataStatus({"val": true, "date": getTime()})
				} catch {
					setNicDataStatus({"val": false, "date": getTime()})
					toast.error("Failed to fetch network interface data ")
				}


				try {
					const fetchUserActivity = await fetch(`/api/get-users-activity?page=${page}&size=${size}`); 
					const userData = await fetchUserActivity.json();
					if (userData.error) 
						throw Error("Failed to fetch user activity");
					setUserActivityDataStatus({"val": true, "date": getTime()})
				} catch {
					toast.error("Failed to fetch user activity data.")
					setUserActivityDataStatus({"val": false, "date": getTime()})
				}
				setIsMounted(true);
			} catch (err) {
				console.error("Polling error:", err);
			}
		};

		fetchData();
		const interval = setInterval(fetchData, 3000);
		return () => clearInterval(interval);
	}, []);


	useEffect(()=> {
		(async ()=>{
			try {
				const fetchUserActivity = await fetch(`/api/get-users-activity?page=${page}&size=${size}`); 
				const userData = await fetchUserActivity.json();
				if (userData.error) 
					throw Error("Failed to fetch user activity");
				setUserActivityData(userData)
				setIsMounted2(true);
			} catch {
				toast.error("Failed to fetch user activity data.")
				setUserActivityDataStatus({"val": true, "date": getTime()})
			}

		})()
	}, [])
	useEffect(()=> {
		(async ()=>{
			try {
				const fetchUserActivity = await fetch(`/api/get-users-activity?page=${page}&size=${size}`); 
				const userData = await fetchUserActivity.json();
				if (userData.error) 
					throw Error("Failed to fetch user activity");
				setUserActivityData(userData)
				setUserActivityDataStatus({"val": true, "date": getTime()})
			} catch {
				toast.error("Failed to fetch user activity data.")
				setUserActivityDataStatus({"val": false, "date": getTime()})
			}
		})()
	}, [page])

	// if (!isMounted || !isMounted2) {
	// 	return <div className="flex flex-row items-stretch gap-6 p-10">
	//        <MetricSkeleton />
	//        <MetricSkeleton />
	//        <MetricSkeleton />
	//      </div>
	//  }
  return (
		<div>
			<div className="grid grid-cols-4 gap-2" >
				<div className="col-span-3 flex flex-col gap-2 row-span-full">
				{
					JSON.stringify(nodeData) !== "{}" ?
					<WhiteContainer style="relative">
						<SummaryCard label="Total Nodes" value={nodeData.total_users !== undefined ? nodeData.total_users : "Loading..."} />
						<SummaryCard label="Active Nodes" value={nodeData.active_users  !== undefined ? nodeData.active_users : "Loading..."}/>
						<SummaryCard label="Inactive Nodes" value={nodeData.inactive_users !== undefined ? nodeData.inactive_users : "Loading..."} />
						<Link href="#" key="view-nodes" className="text-white bg-blue-600 hover:bg-blue-500 transition-all duration-150 w-full rounded-3xl px-2 py-1 text-xl text-center font-medium">
							{ "View Nodes" }
						</Link>
					</WhiteContainer> : <MetricSkeleton />
				}
				{
					JSON.stringify(netData) !== "{}" ?
					<WhiteContainer style="flex-col items-stretch relative flex-wrap xl:flex-nowrap">
						<div className="flex gap-2 items-stretch relative flex-wrap xl:flex-nowrap">
							<GrayTopContainer title="Download Speed">
								{/* Placed inside the Card component's child slot */}
								<SpeedometerGauge value={netData.download_mbps} max={100} unit="Mbps" />
							</GrayTopContainer>

							<GrayTopContainer title="Upload Speed">
								<SpeedometerGauge value={netData.upload_mbps !== undefined ? netData.upload_mbps : 0		} max={100} unit="Mbps" />
							</GrayTopContainer>
							<GrayTopContainer title="Packet Loss">
								{/* Placed inside the Card component's child slot */}
								<PacketLossChart currentLoss={netData.loss_percent !== undefined ? netData.loss_percent : 0} history={lossHistory} />
							</GrayTopContainer>
						</div>
					</WhiteContainer>:  <MetricSkeleton className=""/>

				}
		 </div>
				<div className="col-span-1 flex flex-col gap-2 row-span-full w-full">
				{
					JSON.stringify(nicData) !== "{}" ?
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

					</GrayTopContainer> : <MetricSkeleton/>
				}

					<WhiteContainer style="h-full justify-center  flex-col">
						<div className="flex  items-center gap-1">
							<span className="font-bold text-sm">Node Data: </span>
							<StatusBadge className="fixed bottom-0 right-0" isLive={nodeDataStatus.val} lastUpdated={nodeDataStatus.date} />
						</div>
						<div className="flex items-center gap-1">
							<span className="font-bold text-sm">User Data: </span>
							<StatusBadge className="fixed bottom-0 right-0" isLive={userActivityDataStatus.val} lastUpdated={userActivityDataStatus.date} />
						</div>
						<div className="flex items-center gap-1">
							<span className="font-bold text-sm">Network Data: </span> <StatusBadge className="fixed bottom-0 right-0" isLive={netDataStatus.val} lastUpdated={netDataStatus.date} />
						</div>
						<div className="flex items-center gap-1">
							<span className="font-bold text-sm">NIC Data: </span>
							<StatusBadge className="fixed bottom-0 right-0" isLive={nicDataStatus.val} lastUpdated={nicDataStatus.date} />
						</div>
					</WhiteContainer>
				</div>


			</div>

				<div className="col-span-1 pt-2 flex flex-col gap-2 row-span-full w-full">
				{
					JSON.stringify(userActivityData) !== "{}" ?
					<WhiteContainer style="h-full">
						<UserTable 
							data={userActivityData.items} 
							onPageChange={(newPage) => setPage(newPage)}
							currentPage={userActivityData.page} 
							totalPages={userActivityData.pages}
						/>

					</WhiteContainer>:  <MetricSkeleton/>
				}
				</div>
		</div>
  );
}
