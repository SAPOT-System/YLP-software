export default function MetricSkeleton() {
  return (
    <div className="flex-1 min-w-[300px] overflow-hidden bg-white border border-gray-100 shadow-sm rounded-2xl animate-pulse">
      {/* Fake Header Area */}
      <div className="px-6 py-4 bg-gray-100 border-b border-gray-100">
        <div className="h-4 w-32 bg-gray-200 rounded mx-auto"></div>
      </div>

      {/* Fake Content Area (Gauge Circle Shape) */}
      <div className="p-10 flex flex-col items-center justify-center space-y-6">
        {/* The Circle Gauge Skeleton */}
        <div className="w-32 h-32 rounded-full border-[12px] border-gray-100"></div>
        
        {/* Fake Number Label */}
        <div className="h-6 w-20 bg-gray-100 rounded"></div>
      </div>
    </div>
  );
}
