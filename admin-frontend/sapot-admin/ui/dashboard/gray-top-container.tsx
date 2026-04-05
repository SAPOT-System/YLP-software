import clsx from 'clsx';
import { ReactNode } from 'react';

interface DashboardMetricCardProps {
  title: string;
  children?: ReactNode; // This is where the actual gauge will go
  className?: string; // Optional: To override default card styles (like width)
	border?: Boolean;
	classNameContent?: string;
}

export default function GrayTopContainer({
  title,
  children,
	classNameContent = "",
  className = "",
	border = true,
}: DashboardMetricCardProps) {
  return (
    <div
      className={clsx(
        // Core Card Styles: Border, rounded corners, slight shadow
        'w-full max-w-sm overflow-hidden bg-white border border-gray-100 shadow-sm rounded-2xl custom-white ',
        className
      )}
    >
      {/* 1. The Header: Gray background top area */}
      <div className="px-6 py-4 custom-gray border-b border-gray-100">
        <h3 className="text-lg font-semibold text-center">
          {title}
        </h3>
      </div>

      {/* 2. The Content: White background area for the gauge */}
      <div className={clsx("flex flex-col items-center justify-center",
													 classNameContent,
													 {"p-10 space-y-4": border }) }>
        {children}
      </div>
    </div>
  );
}
