'use client';

import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  ResponsiveContainer, 
  Tooltip 
} from 'recharts';

interface PacketLossChartProps {
  currentLoss: number;
  history: { time: string; loss: number }[]; // Array of past data points
}

export default function PacketLossChart({ currentLoss, history }: PacketLossChartProps) {
  return (
    <div className="w-full h-full flex flex-col items-center">
      {/* 1. The Large Percentage Label */}
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-4xl font-bold text-slate-900">{currentLoss}</span>
        <span className="text-xl font-semibold text-slate-500">%</span>
      </div>

      {/* 2. The Graph Area */}
      <div className="w-full h-40 relative">
        {/* Y-Axis Label (Vertical Text) */}
        <div className="absolute left-[-20px] top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Packet loss %
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 10, right: 0, left: 10, bottom: 0 }}>
            <defs>
              {/* This creates the blue-to-transparent fade */}
              <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            
            {/* We hide the axes but keep them for scaling */}
            <XAxis dataKey="time" hide />
            <YAxis hide domain={[0, 'auto']}  padding={{ bottom: 10 }}/>
						
            
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />

            <Area
              type="monotone"
              dataKey="loss"
              stroke="#3b82f6"      // The bright blue line
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorLoss)" // Uses the gradient defined above
              animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 3. The Bottom Label */}
      <p className="mt-4 text-xs font-bold text-slate-800 uppercase tracking-wide">
        Time per 5 mins
      </p>
    </div>
  );
}
