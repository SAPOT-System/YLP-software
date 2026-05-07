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
import { getTime } from "../dashboard/page";
import MapLibre from "@/ui/components/MapLibre";
import { UserNode } from "../../../ui/components/MapLibre";


export default function Nodes() {
  const [nodeData, setNodeData] = useState({});
  const [nodeDataStatus, setNodeDataStatus] = useState({"val": false, "date": getTime()});
  const [locations, setLocations] = useState<UserNode[]>([]);
  useEffect(() => {
    const fetchData = async () => {
      
      try {
	// Call your NEXT.JS proxy, not the secureFetch directly
	try {
	  const [nodePromise, latestLocationsPromise] = await Promise.all([
	    fetch('/api/active-users'),
	    fetch('/api/get-gps/latest')
	  ])
	  const [parsedNode, parsedLatestLocation] = await Promise.all([
	    nodePromise.json(),
	    latestLocationsPromise.json()
	  ])

	  if (parsedNode.error || parsedLatestLocation.error) 
	    throw Error("Cannot fetch node data");
	  setNodeData(parsedNode);
	  setNodeDataStatus({"val": true, "date": getTime()})
	  setLocations(parsedLatestLocation);
	} catch {
	  setNodeDataStatus({"val": false, "date": getTime()})
	  toast.error("Failed to fetch GPS nodes data.")
	}
      } catch (err) {
	console.log("Error fetching data");
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
    }, []);

  return (
    <div className="flex flex-col gap-2">
      {
	JSON.stringify(nodeData) !== "{}" ?
	  <div className="flex gap-2">
	    <SummaryCard label="Active Nodes" value={nodeData.active_users  !== undefined ? nodeData.active_users : "Loading..."}/>
	    <SummaryCard label="Total Nodes" value={nodeData.total_users !== undefined ? nodeData.total_users : "Loading..."} />
	    <SummaryCard label="Inactive Nodes" value={nodeData.inactive_users !== undefined ? nodeData.inactive_users : "Loading..."} />
	    <div className="w-full py-3 px-2  flex-col  gap-2 h-full">
	      <div className="flex gap-2">
		<div className="marker-wrapper">
		  <div className="custom-marker"/>
		</div> Active Nodes
	      </div>
	      <div className="flex gap-2">
		<div className="marker-wrapper">
		  <div className="custom-marker inactive"/>
		</div> Inactive Nodes
	      </div>
	      Click nodes to view details.
	    </div>
	  </div> : <MetricSkeleton />
      }
      <MapLibre data={locations}/>
    </div>
  );
}
