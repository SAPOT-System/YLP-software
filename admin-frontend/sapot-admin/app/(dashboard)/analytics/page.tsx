'use client';

import GrayTopContainer from "@/ui/dashboard/gray-top-container";
import WhiteContainer from "@/ui/dashboard/white-rounded-container";
import { useState, useEffect } from 'react';
import { toast } from "sonner";
import { getTime } from '../dashboard/page';
import SpeedometerGauge from "@/ui/dashboard/speedometer";
import PacketLossChart from "@/ui/dashboard/packet-loss-chart";
import ReusableTable from "@/ui/dashboard/reusable-table";
import MetricSkeleton from "@/ui/dashboard/skeleton";
import NetworkTable from "@/ui/dashboard/network-table";


export default function Analytics() {
	const [netDataStatus, setNetDataStatus] = useState({"val": false, "date": getTime()});
	const [lossHistory, setLossHistory] = useState([]);
	const [nicDataStatus, setNicDataStatus] = useState({"val": false, "date": getTime()});
	const [nicData, setNicData] = useState({});
	const [specificNicData, setSpecificNicData] = useState({});
	const [netData, setNetData] = useState({});
	const [isMounted, setIsMounted] = useState(false);

const transformNetworkData = (apiResponse) => {
  return Object.entries(apiResponse)
    // Optional: Filter out loopback 'lo' or other internal interfaces if needed
    .filter(([name]) => name !== 'lo') 
    .map(([name, details]) => ({
      Interface: name,
      Inbound: details.inbound,
      Outbound: details.outbound,
      Status: details.status === 'up' ? 'Active' : 'Down'
    }));
};

	useEffect(() => {
		const fetchData = async () => {
			try {
				// Call your NEXT.JS proxy, not the secureFetch directly

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
					setSpecificNicData(transformNetworkData(nicData))
					console.log("transformed",transformNetworkData(nicData))
				} catch {
					setNicDataStatus({"val": false, "date": getTime()})
					toast.error("Failed to fetch network interface data ")
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
	if (!isMounted) {
		return <div className="flex flex-row items-stretch gap-6 p-10">
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
      </div>
	}
  return (
			<WhiteContainer style="flex-col gap-2 items-stretch relative flex-wrap xl:flex-nowrap">
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
				<div className="grid grid-cols-4 gap-2">

					<NetworkTable 
						columns={["Interface", "Inbound", "Outbound", "Status"]} 
						data={specificNicData}
						className="col-span-3"
						/>

					<GrayTopContainer border={false} title="Active Interfaces" className="w-full col-span-1 h-full flex flex-col" classNameContent="flex flex-col h-full overflow-hidden"> 
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
				</div>
			</WhiteContainer>
  );
}
