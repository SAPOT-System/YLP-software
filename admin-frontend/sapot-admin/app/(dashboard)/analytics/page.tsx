'use client';

import GrayTopContainer from "@/ui/dashboard/gray-top-container";
import WhiteContainer from "@/ui/dashboard/white-rounded-container";
import { toast } from "sonner";
import { getTime } from '../dashboard/page';
import SpeedometerGauge from "@/ui/dashboard/speedometer";
import PacketLossChart from "@/ui/dashboard/packet-loss-chart";
import ReusableTable from "@/ui/dashboard/reusable-table";
import MetricSkeleton from "@/ui/dashboard/skeleton";
import NetworkTable from "@/ui/dashboard/network-table";
import { useEffect, useState, useRef } from "react";

export default function Analytics() {
  const [netData, setNetData] = useState({});
  const [lossHistory, setLossHistory] = useState([]);
  const [nicData, setNicData] = useState({});
  const [specificNicData, setSpecificNicData] = useState([]);
  const [netDataStatus, setNetDataStatus] = useState({ val: false, date: getTime() });
  const [nicDataStatus, setNicDataStatus] = useState({ val: false, date: getTime() });
  const [isMounted, setIsMounted] = useState(false);

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

  const runFetch = async () => {
    // Prevent overlapping calls
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const [networkRes, nicRes] = await Promise.all([
        fetch("/api/get-network-usage"),
        fetch("/api/get-interfaces"),
      ]);

      const [networkData, nicRaw] = await Promise.all([
        networkRes.json(),
        nicRes.json(),
      ]);

      const now = getTime();

      // --- NETWORK ---
      if (!networkData.error) {
        setNetData(networkData);
        setNetDataStatus({ val: true, date: now });

        const newPoint = {
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          loss: networkData.loss_percent,
        };

        setLossHistory((prev) => [...prev, newPoint].slice(-20));
      } else {
        setNetDataStatus({ val: false, date: now });
      }

      // --- NIC ---
      if (!nicRaw.error) {
        const activeInterfaces = Object.fromEntries(
          Object.entries(nicRaw).filter(([_, info]) => info.status === "up")
        );

        setNicData(activeInterfaces);
        setSpecificNicData(transformNetworkData(nicRaw));
        setNicDataStatus({ val: true, date: now });
      } else {
        setNicDataStatus({ val: false, date: now });
      }

      setIsMounted(true);
    } catch (err) {
      console.error("Polling error:", err);
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

        await new Promise((res) => setTimeout(res, delay));
      }
    };

    loop();

    return () => {
      isActive = false;
    };
  }, []);

  if (!isMounted) {
    return (
      <div className="flex flex-row items-stretch gap-6 p-10">
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
      </div>
    );
  }

  return (
    <WhiteContainer style="flex-col gap-2 items-stretch relative flex-wrap xl:flex-nowrap">
      <div className="flex gap-2 items-stretch relative flex-wrap xl:flex-nowrap">
        <GrayTopContainer title="Download Speed">
          <SpeedometerGauge value={netData.download_mbps} max={100} unit="Mbps" />
        </GrayTopContainer>

        <GrayTopContainer title="Upload Speed">
          <SpeedometerGauge
            value={netData.upload_mbps ?? 0}
            max={100}
            unit="Mbps"
          />
        </GrayTopContainer>

        <GrayTopContainer title="Packet Loss">
          <PacketLossChart
            currentLoss={netData.loss_percent ?? 0}
            history={lossHistory}
          />
        </GrayTopContainer>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <NetworkTable
          columns={["Interface", "Inbound", "Outbound", "Status"]}
          data={specificNicData}
          className="col-span-3"
        />

        <GrayTopContainer
          border={false}
          title="Active Interfaces"
          className="w-full col-span-1 h-full flex flex-col"
          classNameContent="flex flex-col h-full overflow-hidden"
        >
          <div className="flex-1 w-full min-h-0 overflow-y-auto [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex flex-col gap-2 w-full p-0">
              {Object.entries(nicData).map(([name, data]) => (
                <div key={name} className="border-b-gray-300 border-b p-4">
                  <span className="font-bold">{name}</span> {data.ipv4}
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
