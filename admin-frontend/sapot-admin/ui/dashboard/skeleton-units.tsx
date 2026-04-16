// src/components/dashboard/SkeletonUnits.tsx

// 1. UNIT: Mimics the small Node Status cards at the top
export function NodeStatusSkeleton() {
  return (
    <div className="flex-1 min-w-[120px] bg-slate-50 p-5 rounded-2xl border border-gray-100 animate-pulse">
      {/* Fake Title */}
      <div className="h-3 w-16 bg-gray-200 rounded mb-2"></div>
      {/* Fake Large Number */}
      <div className="h-10 w-8 bg-gray-200 rounded"></div>
    </div>
  );
}

// 2. UNIT: Mimics the large Metric Card containers in the bottom row
interface MetricCardSkeletonProps {
  hasHeader?: boolean;
}

export function MetricCardSkeleton({ hasHeader = true }: MetricCardSkeletonProps) {
  return (
    <div className="flex-1 min-w-[300px] overflow-hidden bg-white border border-gray-100 shadow-sm rounded-2xl animate-pulse">
      {/* Fake Header Area (if needed, like Download/Packet Loss) */}
      {hasHeader && (
        <div className="px-6 py-4 bg-gray-100 border-b border-gray-100">
          <div className="h-4 w-32 bg-gray-200 rounded mx-auto"></div>
        </div>
      )}

      {/* Fake Content Area */}
      <div className="p-8 flex flex-col items-center justify-center space-y-6 h-full min-h-[300px]">
        {/* Placeholder for the gauge circle or big text */}
        <div className="w-32 h-32 rounded-full border-[12px] border-gray-100"></div>
        {/* Placeholder for small label text */}
        <div className="h-4 w-20 bg-gray-100 rounded"></div>
      </div>
    </div>
  );
}
