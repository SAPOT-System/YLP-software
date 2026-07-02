'use client';

import GrayTopContainer from "@/ui/dashboard/gray-top-container";
import WhiteContainer from "@/ui/dashboard/white-rounded-container";
import { getTime } from '../dashboard/page';
import SpeedometerGauge from "@/ui/dashboard/speedometer";
import PacketLossChart from "@/ui/dashboard/packet-loss-chart";
import NetworkTable from "@/ui/dashboard/network-table";
import { useEffect, useState, useRef } from "react";
import { ChevronRight, Loader } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import Link from "next/link";


function RouterHealthChart({ data }) {
  return (
    <div className="custom-white rounded-2xl p-3 shadow-sm h-[260px]">
      <p className="text-xs text-gray-500 mb-2">CPU / Memory History</p>

      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={data}>
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="cpu" strokeWidth={2} />
          <Line type="monotone" dataKey="mem" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrafficChart({ data, iface= "Ether5" }) {
  return (
    <div className="custom-white rounded-2xl p-3 shadow-sm h-[260px]">
      <p className="text-xs text-gray-500 mb-2">{iface + " Traffic"}</p>

      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={data}>
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="rx" strokeWidth={2} />
          <Line type="monotone" dataKey="tx" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Analytics() {
	const [routerHealthLatest, setRouterHealthLatest] = useState(null);
	const [routerHealthHistory, setRouterHealthHistory] = useState([]);
	const [trafficHistory, setTrafficHistory] = useState([]);
	const [trafficHistory2, setTrafficHistory2] = useState([]);
	const [trafficHistory3, setTrafficHistory3] = useState([]);

	const fetchRouterHealthLatest = async () => {
		try {
			const res = await fetch("/api/router/health/latest");

			if (!res.ok) throw new Error("Failed latest health fetch");

			const data = await res.json();
			setRouterHealthLatest(data);
		} catch (err) {
			console.error(err);
		}
	};

	const fetchRouterHealthHistory = async () => {
		try {
			const res = await fetch("/api/router/health/history?limit=50");
			if (!res.ok) throw new Error("Failed history fetch");

			const data = await res.json();

			const formatted = data
				.map((item) => ({
					time: new Date(item.created_at).toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					}),
					cpu: item.cpu_load,
					mem:
						((item.total_memory - item.free_memory) / item.total_memory) * 100,
				}))
				.reverse();

			setRouterHealthHistory(formatted);
		} catch (err) {
			console.error(err);
		}
	};

	const fetchTrafficHistory = async (iface = "ether5") => {
		try {
			const res = await fetch("/api/router/traffic/ether5?limit=100");

			if (!res.ok) throw new Error("Failed traffic fetch");

			const data = await res.json();

			const formatted = data
				.map((item) => ({
					time: new Date(item.created_at).toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					}),
					rx: item.rx_bps / 1_000_000,
					tx: item.tx_bps / 1_000_000,
				}))
				.reverse();

			setTrafficHistory(formatted);
		} catch (err) {
			console.error(err);
		}
	};


	const fetchTrafficHistory2 = async (iface = "ether4") => {
		try {
			const res = await fetch("/api/router/traffic/ether4?limit=100");

			if (!res.ok) throw new Error("Failed traffic fetch");

			const data = await res.json();

			const formatted = data
				.map((item) => ({
					time: new Date(item.created_at).toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					}),
					rx: item.rx_bps / 1_000_000,
					tx: item.tx_bps / 1_000_000,
				}))
				.reverse();

			setTrafficHistory2(formatted);
		} catch (err) {
			console.error(err);
		}
	};


	const fetchTrafficHistory3 = async (iface = "ether1") => {
		try {
			const res = await fetch("/api/router/traffic/ether1?limit=100");

			if (!res.ok) throw new Error("Failed traffic fetch");

			const data = await res.json();

			const formatted = data
				.map((item) => ({
					time: new Date(item.created_at).toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					}),
					rx: item.rx_bps / 1_000_000,
					tx: item.tx_bps / 1_000_000,
				}))
				.reverse();

			setTrafficHistory3(formatted);
		} catch (err) {
			console.error(err);
		}
	};


  const [netData, setNetData] = useState({
    download_mbps: 0,
    upload_mbps: 0,
    loss_percent: 0,
  });

	const [routerData, setRouterData] = useState(null);
	const [routerLoading, setRouterLoading] = useState(true);

	const [routerStatus, setRouterStatus] = useState({
		val: false,
		date: getTime()
	});


	const latestTraffic = routerData?.traffic?.[0];

	const cpuLoad = routerData?.health?.cpu_load ?? 0;

	const freeMem = routerData?.health?.free_memory ?? 0;
	const totalMem = routerData?.health?.total_memory ?? 1;

	const memUsage = ((totalMem - freeMem) / totalMem) * 100;

	const rxBps = latestTraffic?.rx_bps ?? 0;
	const txBps = latestTraffic?.tx_bps ?? 0;
	const rxMbps = rxBps / 1_000_000;
	const txMbps = txBps / 1_000_000;


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


	const fetchRouterDashboard = async () => {
		try {
			const res = await fetch("/api/router/dashboard");

			if (!res.ok) {
				throw new Error("Failed router dashboard fetch");
			}

			const data = await res.json();

			if (data?.error) {
				throw new Error(data.error);
			}

			setRouterData(data);

			setRouterStatus({
				val: true,
				date: getTime()
			});

		} catch (err) {
			console.error(err);

			setRouterStatus({
				val: false,
				date: getTime()
			});

			toast.error("Failed to fetch router dashboard.");
		} finally {
			setRouterLoading(false);
		}
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
      const [netResult, nicResult, routerResult] = await Promise.allSettled([
        fetchNetworkData(),
        fetchNicData(),
				fetchRouterDashboard(),
      ]);

			const [healthResult, historyResult, trafficResult] =
				await Promise.allSettled([
					fetchRouterHealthLatest(),
					fetchRouterHealthHistory(),
					fetchTrafficHistory("ether5"),
					fetchTrafficHistory2("ether4"),
					fetchTrafficHistory3("ether4"),
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
      <div>

				<div className="flex items-center justify-between px-1">
					<h2 className="text-sm font-semibold text-gray-700">
						Server Quick Stats
					</h2>
				</div>
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
      </div></div>


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


			{/* ROUTER SHIT */}
			<div className="flex flex-col gap-2">

				{/* TITLE */}
					<div className="flex items-center justify-between px-1">
						<h2 className="text-sm font-semibold text-gray-700">
							Router Board Quick Stats
						</h2>
						<Link
							href="http://192.168.0.1"
							target="_blank"
							className="text-xs flex gap-1 items-center justify-center hover:text-blue-300"
						>
							Router Board Web Interface
							<ChevronRight/>
						</Link>
					</div>

				<div className="grid grid-cols-2 md:grid-cols-4 gap-2">

					{/* CPU */}
					<div className="rounded-2xl p-3 custom-white shadow-sm min-h-[90px] flex flex-col justify-center">
						{routerLoading ? (
							<div className="flex flex-col items-center gap-1 text-gray-400">
								<Loader size={18} className="animate-spin" />
								<p className="text-xs">Loading...</p>
							</div>
						) : (
							<>
								<p className="text-xs text-gray-500">CPU Load</p>
								<p className="text-lg font-semibold">{cpuLoad}%</p>
							</>
						)}
					</div>

					{/* MEMORY */}
					<div className="rounded-2xl p-3 custom-white shadow-sm min-h-[90px] flex flex-col justify-center">
						{routerLoading ? (
							<div className="flex flex-col items-center gap-1 text-gray-400">
								<Loader size={18} className="animate-spin" />
								<p className="text-xs">Loading...</p>
							</div>
						) : (
							<>
								<p className="text-xs text-gray-500">Memory</p>
								<p className="text-lg font-semibold">
									{memUsage.toFixed(1)}%
								</p>
							</>
						)}
					</div>

					{/* DOWNLOAD */}
					<div className="rounded-2xl p-3 custom-white shadow-sm min-h-[90px] flex flex-col justify-center">
						{routerLoading ? (
							<div className="flex flex-col items-center gap-1 text-gray-400">
								<Loader size={18} className="animate-spin" />
								<p className="text-xs">Loading...</p>
							</div>
						) : (
							<>
								<p className="text-xs text-gray-500">RX</p>
								<p className="text-lg font-semibold">
									{rxMbps.toFixed(2)} Mbps
								</p>
							</>
						)}
					</div>

					{/* UPLOAD */}
					<div className="rounded-2xl p-3 custom-white shadow-sm min-h-[90px] flex flex-col justify-center">
						{routerLoading ? (
							<div className="flex flex-col items-center gap-1 text-gray-400">
								<Loader size={18} className="animate-spin" />
								<p className="text-xs">Loading...</p>
							</div>
						) : (
							<>
								<p className="text-xs text-gray-500">TX</p>
								<p className="text-lg font-semibold">
									{txMbps.toFixed(2)} Mbps
								</p>
							</>
						)}
					</div>

				</div>
			</div>

			<div className="grid grid-cols-1 xl:grid-cols-2 gap-2 mt-2">
				<RouterHealthChart data={routerHealthHistory} />
				<TrafficChart data={trafficHistory} iface="Site 1 (Ether5)" />
				<TrafficChart data={trafficHistory2} iface="Site 2 (Ether4)" />
				<TrafficChart data={trafficHistory3} iface="Internet Gateway (Ether1)" />
			</div>
    </WhiteContainer>
  );
}
