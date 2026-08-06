'use client';

import GrayTopContainer from "@/ui/dashboard/gray-top-container";
import PacketLossChart from "@/ui/dashboard/packet-loss-chart";
import SpeedometerGauge from "@/ui/dashboard/speedometer";
import StatusBadge from "@/ui/dashboard/status-badge";
import SummaryCard from "@/ui/dashboard/summary-card";
import UserTable from "@/ui/dashboard/user-table";
import WhiteContainer from "@/ui/dashboard/white-rounded-container";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, ChevronRight, Loader, MoveRight } from "lucide-react";
import { withBasePath } from "@/lib/basePath";

export function getTime() {
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila'
  }).format(new Date());
}

export default function Dashboard() {
  const size = 5;

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

  const [page, setPage] = useState(1);

  // NODE DATA
  const [nodeData, setNodeData] = useState(null);
  const [nodeLoading, setNodeLoading] = useState(true);

  const [nodeDataStatus, setNodeDataStatus] = useState({
    val: false,
    date: getTime()
  });

  // NETWORK DATA
  const [netData, setNetData] = useState({
    download_mbps: 0,
    upload_mbps: 0,
    loss_percent: 0,
  });

  const [netLoading, setNetLoading] = useState(true);

  const [netDataStatus, setNetDataStatus] = useState({
    val: false,
    date: getTime()
  });

  // LOSS HISTORY
  const [lossHistory, setLossHistory] = useState([]);

  // NIC DATA
  const [nicData, setNicData] = useState({});
  const [nicLoading, setNicLoading] = useState(true);

  const [nicDataStatus, setNicDataStatus] = useState({
    val: false,
    date: getTime()
  });

  // USER ACTIVITY
  const [userActivityData, setUserActivityData] = useState(null);
  const [userLoading, setUserLoading] = useState(true);

  const [userActivityDataStatus, setUserActivityDataStatus] = useState({
    val: false,
    date: getTime()
  });

  // Prevent overlapping fetches
  const isFetchingRef = useRef(false);

	const fetchRouterDashboard = async () => {
		try {
			const res = await fetch(withBasePath("/api/router/dashboard"));

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

  // =====================================================
  // FETCH NODE DATA
  // =====================================================

  const fetchNodeData = async () => {
    try {
      const res = await fetch(withBasePath('/api/active-users'));

      if (!res.ok) {
        throw new Error("Failed active users fetch");
      }

      const data = await res.json();

      if (data?.error) {
        throw new Error(data.error);
      }

      setNodeData(data);

      setNodeDataStatus({
        val: true,
        date: getTime()
      });

    } catch (err) {
      console.error(err);

      setNodeDataStatus({
        val: false,
        date: getTime()
      });

      toast.error("Failed to fetch active nodes.");
    } finally {
      setNodeLoading(false);
    }
  };

  // =====================================================
  // FETCH NETWORK DATA
  // =====================================================

  const fetchNetworkData = async () => {
    try {
      const res = await fetch(withBasePath('/api/get-network-usage'));

      if (!res.ok) {
        throw new Error("Failed network fetch");
      }

      const data = await res.json();

      if (data?.error) {
        throw new Error(data.error);
      }

      setNetData({
        download_mbps: data.download_mbps ?? 0,
        upload_mbps: data.upload_mbps ?? 0,
        loss_percent: data.loss_percent ?? 0,
      });

      const newPoint = {
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        loss: data.loss_percent ?? 0,
      };

      setLossHistory((prev) => [...prev, newPoint].slice(-20));

      setNetDataStatus({
        val: true,
        date: getTime()
      });

    } catch (err) {
      console.error(err);

      setNetDataStatus({
        val: false,
        date: getTime()
      });

      toast.error("Failed to fetch network data.");
    } finally {
      setNetLoading(false);
    }
  };

  // =====================================================
  // FETCH NIC DATA
  // =====================================================

  const fetchNICData = async () => {
    try {
      const res = await fetch(withBasePath('/api/get-interfaces'));

      if (!res.ok) {
        throw new Error("Failed interfaces fetch");
      }

      const data = await res.json();

      if (data?.error) {
        throw new Error(data.error);
      }

      const activeInterfaces = Object.fromEntries(
        Object.entries(data).filter(
          ([_, info]) => info?.status === "up"
        )
      );

      setNicData(activeInterfaces);

      setNicDataStatus({
        val: true,
        date: getTime()
      });

    } catch (err) {
      console.error(err);

      setNicDataStatus({
        val: false,
        date: getTime()
      });

      toast.error("Failed to fetch NIC data.");
    } finally {
      setNicLoading(false);
    }
  };

  // =====================================================
  // FETCH USER ACTIVITY
  // =====================================================

  const fetchUserActivity = async () => {
    try {
      const res = await fetch(
        withBasePath(`/api/get-users-activity?page=${page}&size=${size}`)
      );

      if (!res.ok) {
        throw new Error("Failed user activity fetch");
      }

      const data = await res.json();

      if (data?.error) {
        throw new Error(data.error);
      }

      setUserActivityData(data);

      setUserActivityDataStatus({
        val: true,
        date: getTime()
      });

    } catch (err) {
      console.error(err);

      setUserActivityDataStatus({
        val: false,
        date: getTime()
      });

      toast.error("Failed to fetch user activity.");
    } finally {
      setUserLoading(false);
    }
  };

  // =====================================================
  // MAIN POLLING LOOP
  // =====================================================

  const runFetchCycle = async () => {
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;

    try {
      await Promise.allSettled([
        fetchNodeData(),
        fetchNetworkData(),
        fetchNICData(),
        fetchUserActivity(),
				fetchRouterDashboard(),
      ]);
    } finally {
      isFetchingRef.current = false;
    }
  };

  // =====================================================
  // INITIALIZE POLLING
  // =====================================================

  useEffect(() => {
    let isActive = true;

    const loop = async () => {
      while (isActive) {
        const start = Date.now();

        await runFetchCycle();

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

  // REFETCH USER TABLE ON PAGE CHANGE

  useEffect(() => {
    fetchUserActivity();
  }, [page]);

  return (
    <div>

      <div className="grid grid-cols-4 gap-2">

        {/* LEFT SIDE */}
        <div className="col-span-3 flex flex-col gap-2 row-span-full">

						<div className="flex items-center justify-between px-1">
							<h2 className="text-sm font-semibold text-gray-700">
								User Location Broadcast
							</h2>
						</div>
          {/* NODE CARDS */}
          {nodeLoading ? (
            <div className="flex gap-2 items-stretch">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="flex-1 rounded-3xl p-6 flex items-center justify-center min-h-[160px] custom-white border border-gray-200 shadow-md"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Loader
                      size={20}
                      className="animate-spin text-gray-400"
                    />

                    <p className="text-xs text-gray-500">
                      Loading Node Data...
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <WhiteContainer style="relative">

              <SummaryCard
                label="Total Nodes"
                value={nodeData?.total_users ?? 0}
              />

              <SummaryCard
                label="Active Nodes"
                value={nodeData?.active_users ?? 0}
              />

              <SummaryCard
                label="Inactive Nodes"
                value={nodeData?.inactive_users ?? 0}
              />

              <Link
                href="/nodes"
                className="text-white bg-blue-600 hover:bg-blue-500 transition-all duration-150 w-full rounded-3xl px-2 py-1 text-xl text-center font-medium"
              >
                View Nodes
              </Link>

            </WhiteContainer>
          )}

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
          {/* NETWORK */}

						<div className="flex items-center justify-between px-1">
							<h2 className="text-sm font-semibold text-gray-700">
								Server Quick Stats
							</h2>
						</div>

          {netLoading ? (
            <div className="flex gap-2 items-stretch relative flex-wrap xl:flex-nowrap">

              {/* DOWNLOAD */}
              <div className="flex-1 rounded-lg p-6 flex items-center justify-center min-h-[200px] custom-white border border-gray-200 shadow-md">
                <div className="flex flex-col items-center gap-2">

                  <Loader
                    size={20}
                    className="animate-spin text-gray-400"
                  />

                  <p className="text-xs text-gray-500">
                    Loading Download Speed...
                  </p>

                </div>
              </div>

              {/* UPLOAD */}
              <div className="flex-1 rounded-lg p-6 flex items-center justify-center min-h-[200px] custom-white border border-gray-200 shadow-md">
                <div className="flex flex-col items-center gap-2">

                  <Loader
                    size={20}
                    className="animate-spin text-gray-400"
                  />

                  <p className="text-xs text-gray-500">
                    Loading Upload Speed...
                  </p>

                </div>
              </div>

              {/* PACKET LOSS */}
              <div className="flex-1 rounded-lg p-6 flex items-center justify-center min-h-[200px] custom-white border border-gray-200 shadow-md">
                <div className="flex flex-col items-center gap-2">

                  <Loader
                    size={20}
                    className="animate-spin text-gray-400"
                  />

                  <p className="text-xs text-gray-500">
                    Loading Packet Loss...
                  </p>

                </div>
              </div>

            </div>
          ) : (
            <WhiteContainer style="flex-col items-stretch relative flex-wrap xl:flex-nowrap">

              <div className="flex gap-2 items-stretch relative flex-wrap xl:flex-nowrap">

                <GrayTopContainer title="Download Speed">
                  <SpeedometerGauge
                    value={netData.download_mbps}
                    max={100}
                    unit="Mbps"
                  />
                </GrayTopContainer>

                <GrayTopContainer title="Upload Speed">
                  <SpeedometerGauge
                    value={netData.upload_mbps}
                    max={100}
                    unit="Mbps"
                  />
                </GrayTopContainer>

                <GrayTopContainer title="Packet Loss">
                  <PacketLossChart
                    currentLoss={netData.loss_percent}
                    history={lossHistory}
                  />
                </GrayTopContainer>

              </div>

            </WhiteContainer>
          )}
        </div>

        {/* RIGHT SIDE */}
        <div className="col-span-1 flex flex-col gap-2 row-span-full w-full">

          {/* NIC DATA */}
          {nicLoading ? (
            <div className="w-full h-full rounded-3xl p-6 flex items-center justify-center custom-white border border-gray-200 shadow-md min-h-[300px]">

              <div className="flex flex-col items-center gap-2">

                <Loader
                  size={20}
                  className="animate-spin text-gray-400"
                />

                <p className="text-xs text-gray-500">
                  Loading Interfaces...
                </p>

              </div>

            </div>
          ) : (
            <GrayTopContainer
              border={false}
              title="Active Interfaces"
              className="w-full h-full flex flex-col"
              classNameContent="flex flex-col h-full overflow-hidden"
            >

              <div className="flex-1 overflow-y-auto [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

                <div className="flex flex-col gap-2 w-full p-0">

                  {Object.entries(nicData).length > 0 ? (
                    Object.entries(nicData).map(([name, data]) => (
                      <div
                        key={name}
                        className="border-b-gray-300 border-b p-4"
                      >
                        <span className="font-bold">{name}</span>{" "}
                        {data?.ipv4 ?? "N/A"}
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-gray-500 text-sm">
                      No active interfaces
                    </div>
                  )}

                  <div className="h-4" />

                </div>

              </div>

              <div className="flex-none border-t border-t-gray-300 custom-white w-full p-2 text-[#6B7280] text-center">

                <span className="text-center font-medium">
                  Total Active: {Object.keys(nicData).length}
                </span>

              </div>

            </GrayTopContainer>
          )}

          {/* STATUS BOX */}
          <WhiteContainer style="h-full justify-center flex-col">

            <div className="flex items-center gap-1">
              <span className="font-bold text-sm">
                Node Data:
              </span>

              <StatusBadge
                isLive={nodeDataStatus.val}
                lastUpdated={nodeDataStatus.date}
              />
            </div>

            <div className="flex items-center gap-1">
              <span className="font-bold text-sm">
                User Data:
              </span>

              <StatusBadge
                isLive={userActivityDataStatus.val}
                lastUpdated={userActivityDataStatus.date}
              />
            </div>

            <div className="flex items-center gap-1">
              <span className="font-bold text-sm">
                Network Data:
              </span>

              <StatusBadge
                isLive={netDataStatus.val}
                lastUpdated={netDataStatus.date}
              />
            </div>

            <div className="flex items-center gap-1">
              <span className="font-bold text-sm">
                NIC Data:
              </span>

              <StatusBadge
                isLive={nicDataStatus.val}
                lastUpdated={nicDataStatus.date}
              />
            </div>

          </WhiteContainer>

        </div>
      </div>

      {/* USER TABLE */}
      <div className="pt-2">
						<div className="flex items-center justify-between px-1">
							<h2 className="text-sm font-semibold text-gray-700">
								User Location Broadcast
							</h2>
						</div>
        {userLoading ? (
          <div className="rounded-3xl p-6 flex items-center justify-center min-h-[300px] custom-white border border-gray-200 shadow-md">

            <div className="flex flex-col items-center gap-2">

              <Loader
                size={20}
                className="animate-spin text-gray-400"
              />

              <p className="text-xs text-gray-500">
                Loading User Activity...
              </p>

            </div>

          </div>
        ) : (
          <WhiteContainer style="h-full">

            <UserTable
              data={userActivityData?.items ?? []}
              onPageChange={setPage}
              currentPage={userActivityData?.page ?? 1}
              totalPages={userActivityData?.pages ?? 1}
              refreshData={fetchUserActivity}
            />

          </WhiteContainer>
        )}

      </div>
    </div>
  );
}
