'use client'

import GrayTopContainer from "@/ui/dashboard/gray-top-container";
import SummaryCard from "@/ui/dashboard/summary-card";
import WhiteContainer from "@/ui/dashboard/white-rounded-container";

import Link from "next/link";

import { useState, useEffect, useRef } from 'react';

import { toast } from "sonner";

import { getTime } from "../dashboard/page";

import MapLibre from "@/ui/components/MapLibre";
import { UserNode } from "../../../ui/components/MapLibre";

import { Loader } from "lucide-react";
import { withBasePath } from "@/lib/basePath";

export default function Nodes() {

  // =====================================================
  // STATE
  // =====================================================

  const [nodeData, setNodeData] = useState(null);

  const [locations, setLocations] = useState<UserNode[]>([]);

  const [loading, setLoading] = useState(true);

  const [mapLoading, setMapLoading] = useState(true);

  const [nodeDataStatus, setNodeDataStatus] = useState({
    val: false,
    date: getTime()
  });

  // Prevent overlapping fetches
  const isFetchingRef = useRef(false);

  // =====================================================
  // FETCH NODE DATA
  // =====================================================

  const fetchNodeData = async () => {
    try {

      const res = await fetch(withBasePath('/api/active-users'));

      if (!res.ok) {
        throw new Error("Failed node fetch");
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

      toast.error("Failed to fetch node data.");

    } finally {

      setLoading(false);

    }
  };

  // =====================================================
  // FETCH GPS LOCATIONS
  // =====================================================

  const fetchLocations = async () => {
    try {

      const res = await fetch(withBasePath('/api/get-gps/latest'));

      if (!res.ok) {
        throw new Error("Failed GPS fetch");
      }

      const data = await res.json();

      if (data?.error) {
        throw new Error(data.error);
      }

      setLocations(Array.isArray(data) ? data : []);

    } catch (err) {

      console.error(err);

      toast.error("Failed to fetch GPS node data.");

    } finally {

      setMapLoading(false);

    }
  };

  // =====================================================
  // FETCH LOOP
  // =====================================================

  const runFetchCycle = async () => {

    if (isFetchingRef.current) return;

    isFetchingRef.current = true;

    try {

      await Promise.allSettled([
        fetchNodeData(),
        fetchLocations(),
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

  return (
    <div className="flex flex-col gap-2">

      {/* SUMMARY CARDS */}
      {loading ? (

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

        <div className="flex gap-2">

          <SummaryCard
            label="Active Nodes"
            value={nodeData?.active_users ?? 0}
          />

          <SummaryCard
            label="Total Nodes"
            value={nodeData?.total_users ?? 0}
          />

          <SummaryCard
            label="Inactive Nodes"
            value={nodeData?.inactive_users ?? 0}
          />

          {/* LEGEND */}
          <div className="w-full py-3 px-2 flex-col gap-2 h-full">

            <div className="flex gap-2 items-center">

              <div className="marker-wrapper">
                <div className="custom-marker" />
              </div>

              Active Nodes

            </div>

            <div className="flex gap-2 items-center">

              <div className="marker-wrapper">
                <div className="custom-marker inactive" />
              </div>

              Inactive Nodes

            </div>

            {/* Role markers — shape differs as well as colour, so the
                distinction survives greyscale and colour-blind viewing. */}
            <div className="flex gap-2 items-center">

              <div className="marker-wrapper">
                <div className="custom-marker rescuer" />
              </div>

              Rescuer

            </div>

            <div className="flex gap-2 items-center">

              <div className="marker-wrapper">
                <div className="custom-marker admin" />
              </div>

              Admin

            </div>

            <div className="text-sm text-gray-500 mt-2">
              Click nodes to view details.
            </div>

          </div>

        </div>

      )}

      {/* MAP */}
      {mapLoading ? (

        <div className="rounded-3xl p-6 flex items-center justify-center min-h-[500px] custom-white border border-gray-200 shadow-md">

          <div className="flex flex-col items-center gap-2">

            <Loader
              size={20}
              className="animate-spin text-gray-400"
            />

            <p className="text-xs text-gray-500">
              Loading GPS Map...
            </p>

          </div>

        </div>

      ) : (

        <MapLibre data={locations} />

      )}

    </div>
  );
}
