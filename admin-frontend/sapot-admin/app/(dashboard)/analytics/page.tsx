'use client';

import GrayTopContainer from "@/ui/dashboard/gray-top-container";
import WhiteContainer from "@/ui/dashboard/white-rounded-container";
import { getTime } from '../dashboard/page';
import SpeedometerGauge from "@/ui/dashboard/speedometer";
import PacketLossChart from "@/ui/dashboard/packet-loss-chart";
import NetworkTable from "@/ui/dashboard/network-table";
import { useEffect, useState, useRef } from "react";
import { Loader } from "lucide-react";

export default function Analytics() {
  const [netData, setNetData] = useState({
    download_mbps: 0,
    upload_mbps: 0,
    loss_percent: 0,
  });
  const [lossHistory, setLossHistory] = useState([]);
  const [nicData, setNicData] = useState({});
  const [specificNicData, setSpecificNicData] = useState([]);
  
  // Only show loading on initial mount
  const [netLoading, setNetLoading] = useState(true);
  const [nicLoading, setNicLoading] = useState(true);
  const [hasInitialized, setHasInitialized] = useState(false);

  const isFetchingRef = useRef(false);

  const transformNetworkData = (apiResponse) => {
    return Object.entries(apiResponse)
      .filter(([name]) => name !== "lo")
      .map(([name, details]) => ({
        Interface: name,
        Inbound: details.inbound,
        Outbound: details.outbound,
        Status: details.status === "up" ? "Active" : "Down",
      }));
  };

  const fetchNetworkData = async () => {
    try {
      const res = await fetch("/api/get-network-usage");
      
      if (!res.ok) {
        console.error("Network fetch failed:", res.status);
        return;
      }
      
      const networkData = await res.json();

      if (!networkData.error) {
        setNetData({
          download_mbps: networkData.download_mbps ?? 0,
          upload_mbps: networkData.upload_mbps ?? 0,
          loss_percent: networkData.loss_percent ?? 0,
        });

        const newPoint = {
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          loss: networkData.loss_percent ?? 0,
        };

        setLossHistory((prev) => [...prev, newPoint].slice(-20));
      }
    } catch (err) {
      console.error("Network fetch error:", err);
    } finally {
      // Only hide loading after first successful data
      if (netLoading) {
        setNetLoading(false);
      }
    }
  };

  const fetchNicData = async () => {
    try {
      const res = await fetch("/api/get-interfaces");
      
      if (!res.ok) {
        console.error("Interfaces fetch failed:", res.status);
        return;
      }
      
      const nicRaw = await res.json();

      if (!nicRaw.error && typeof nicRaw === 'object') {
        const activeInterfaces = Object.fromEntries(
          Object.entries(nicRaw).filter(([_, info]) => info?.status === "up")
        );

        setNicData(activeInterfaces);
        setSpecificNicData(transformNetworkData(nicRaw));
      }
    } catch (err) {
      console.error("NIC fetch error:", err);
    } finally {
      // Only hide loading after first successful data
      if (nicLoading) {
        setNicLoading(false);
      }
    }
  };

  const runFetch = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      // Run fetches in parallel
      const [netResult, nicResult] = await Promise.allSettled([
        fetchNetworkData(),
        fetchNicData(),
      ]);

      if (!hasInitialized) {
        setHasInitialized(true);
      }
    } catch (err) {
      console.error("Fetch cycle error:", err);
    } finally {
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    let isActive = true;

    const loop = async () => {
      while (isActive) {
        const start = Date.now();

        await runFetch();

        const duration = Date.now() - start;
        const delay = Math.max(0, 3000 - duration);

        if (isActive) {
          await new Promise((res) => setTimeout(res, delay));
        }
      }
    };

    loop();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <WhiteContainer style="flex-col gap-2 items-stretch relative flex-wrap xl:flex-nowrap">
      <div className="flex gap-2 items-stretch relative flex-wrap xl:flex-nowrap">
        {/* Download Speed */}
        {netLoading ? (
          <div className="flex-1 rounded-lg p-6 flex items-center justify-center min-h-[200px]">
            <div className="flex flex-col items-center gap-2">
              <Loader size={20} className="animate-spin text-gray-400" />
              <p className="text-xs text-gray-500">Loading Download Speed...</p>
            </div>
          </div>
        ) : (
          <GrayTopContainer title="Download Speed">
            <SpeedometerGauge value={netData.download_mbps} max={100} unit="Mbps" />
          </GrayTopContainer>
        )}

        {/* Upload Speed */}
        {netLoading ? (
          <div className="flex-1 rounded-lg p-6 flex items-center justify-center min-h-[200px]">
            <div className="flex flex-col items-center gap-2">
              <Loader size={20} className="animate-spin text-gray-400" />
              <p className="text-xs text-gray-500">Loading Upload Speed...</p>
            </div>
          </div>
        ) : (
          <GrayTopContainer title="Upload Speed">
            <SpeedometerGauge
              value={netData.upload_mbps ?? 0}
              max={100}
              unit="Mbps"
            />
          </GrayTopContainer>
        )}

        {/* Packet Loss */}
        {netLoading ? (
          <div className="flex-1 rounded-lg p-6 flex items-center justify-center min-h-[200px]">
            <div className="flex flex-col items-center gap-2">
              <Loader size={20} className="animate-spin text-gray-400" />
              <p className="text-xs text-gray-500">Loading Packet Loss...</p>
            </div>
          </div>
        ) : (
          <GrayTopContainer title="Packet Loss">
            <PacketLossChart
              currentLoss={netData.loss_percent ?? 0}
              history={lossHistory}
            />
          </GrayTopContainer>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {/* Network Table */}
        {nicLoading ? (
          <div className="col-span-3 rounded-lg p-6 flex items-center justify-center min-h-[200px]">
            <div className="flex flex-col items-center gap-2">
              <Loader size={20} className="animate-spin text-gray-400" />
              <p className="text-xs text-gray-500">Loading Network Interfaces...</p>
            </div>
          </div>
        ) : (
          <NetworkTable
            columns={["Interface", "Inbound", "Outbound", "Status"]}
            data={specificNicData}
            className="col-span-3"
          />
        )}

        {/* Active Interfaces */}
        {nicLoading ? (
          <div className="col-span-1 rounded-lg p-6 flex items-center justify-center min-h-[200px]">
            <div className="flex flex-col items-center gap-2">
              <Loader size={20} className="animate-spin text-gray-400" />
              <p className="text-xs text-gray-500">Loading...</p>
            </div>
          </div>
        ) : (
          <GrayTopContainer
            border={false}
            title="Active Interfaces"
            className="w-full col-span-1 h-full flex flex-col"
            classNameContent="flex flex-col h-full overflow-hidden"
          >
            <div className="flex-1 w-full min-h-0 overflow-y-auto [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex flex-col gap-2 w-full p-0">
                {Object.entries(nicData).length > 0 ? (
                  Object.entries(nicData).map(([name, data]) => (
                    <div key={name} className="border-b-gray-300 border-b p-4">
                      <span className="font-bold">{name}</span> {data?.ipv4 || "N/A"}
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-gray-500 text-sm">No active interfaces</div>
                )}
                <div className="h-4" />
              </div>
            </div>

            <div className="flex-none border-t border-t-gray-300 custom-white w-full p-2 text-[#6B7280] text-center">
              <span className="text-center font-medium">
                Total Active: {Object.entries(nicData).length}
              </span>
            </div>
          </GrayTopContainer>
        )}
      </div>
    </WhiteContainer>
  );
}
