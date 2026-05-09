import React from 'react';
import { Activity, CloudOff } from 'lucide-react';
import clsx from 'clsx';

interface StatusBadgeProps {
  isLive: boolean;
  lastUpdated?: string; // Optional: Pass your formatted Manila time here
	className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ isLive, lastUpdated, className }) => {
  return (
    <div className={ clsx("group relative flex items-center gap-2 w-fit cursor-help", {className: true}) }>
      {/* The Status Indicator */}
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300`}>
        {/* Animated Dot */}
        <span className="relative flex h-2 w-2">
          {isLive && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${isLive ? 'bg-green-600' : 'bg-red-600'}`}></span>
        </span>
        
				<span className="text-xs font-semibold uppercase tracking-wider">
          {isLive ? 'Connected' : 'Disconnected'}
        </span> 
        
				{/*
        {isLive ? <Activity size={14} /> : <CloudOff size={14} />}
				*/}
      </div>

      {/* Custom Tooltip (Appears on Hover) */}
      <div className="absolute top-full left-0 mt-2 hidden group-hover:block z-50">
        <div className="bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-xl whitespace-nowrap border border-gray-800">
          <p className="font-bold">{isLive ? 'Connection Stable' : 'Connection Lost'}</p>
          <p className="text-gray-400">
            {isLive 
              ? `Syncing every 3s • ${lastUpdated || 'Just now'}` 
              : 'Attempting to reconnect to server...'}
          </p>
          {/* Tooltip Arrow */}
          <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-900 rotate-45 border-l border-t border-gray-800"></div>
        </div>
      </div>
    </div>
  );
};

export default StatusBadge;
