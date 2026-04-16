import { MetricCardSkeleton, NodeStatusSkeleton } from "./skeleton-units";

// src/components/dashboard/DashboardSkeleton.tsx
export default function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-8 min-h-screen">
      
      {/* ROW 1: Nodes and Button (Flex Row) */}
      <div className="flex flex-row items-center gap-6 p-5 border border-gray-100 rounded-3xl shadow-sm">
        <NodeStatusSkeleton /> {/* Total */}
        <NodeStatusSkeleton /> {/* Active */}
        <NodeStatusSkeleton /> {/* Inactive */}
        
        {/* Fake Button (View Nodes) */}
        <div className="h-12 w-32 bg-blue-100 rounded-full animate-pulse ml-auto"></div>
      </div>

      {/* ROW 2: The Combined Metrics and Interface Sections (Flex Row) */}
      <div className="flex flex-row items-stretch gap-6">
        
        {/* GROUP A: The three vertical cards with headers (Download, Upload, Packet Loss) */}
        <div className="flex flex-1 flex-row items-stretch gap-6">
          <MetricCardSkeleton hasHeader={true} /> {/* Download */}
          <MetricCardSkeleton hasHeader={true} /> {/* Upload */}
          <MetricCardSkeleton hasHeader={true} /> {/* Packet Loss */}
        </div>

        {/* GROUP B: The two vertical plain cards (Active Interfaces, Status) */}
        <div className="flex flex-col flex-initial w-80 gap-6">
          {/* We reuse the skeleton without the header! */}
          <MetricCardSkeleton hasHeader={false} /> {/* Active Interfaces */}
          <MetricCardSkeleton hasHeader={false} /> {/* Status */}
        </div>
      </div>

    </div>
  );
}
