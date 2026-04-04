'use client';

import { useState, useEffect } from 'react';

interface SpeedometerGaugeProps {
  value: number; // The actual speed (e.g., 76)
  max?: number; // The maximum possible speed on the gauge (e.g., 100)
  unit?: string; // The unit to display (e.g., 'Mbps')
}

export default function SpeedometerGauge({
  value,
  max = 100, // Default to 100 if not provided
  unit = 'Mbps', // Default unit
}: SpeedometerGaugeProps) {
  // SVG Calculations (Fixed constants)
  const RADIUS = 80;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const ANGLE_RANGE = 270; // Total degrees the gauge covers (3/4 of a circle)
  const START_ANGLE = 135; // Where the gauge starts (bottom-left)

  // 1. Convert the input value to a percentage of the total range (0 to 1)
  const percentage = Math.min(value / max, 1);

  // 2. Calculate how many degrees the 'full' arc should cover
  const activeDegrees = percentage * ANGLE_RANGE;

  // 3. Convert degrees into the 'stroke-dashoffset' for the SVG animation
  // (We multiply by the circumference and divide by 360 to get pixel-based offset)
  const progressOffset = CIRCUMFERENCE - (activeDegrees / 360) * CIRCUMFERENCE;

  // 4. State for smooth animation (We start at max-offset and animate towards progressOffset)
  const [animatedOffset, setAnimatedOffset] = useState(CIRCUMFERENCE);

  useEffect(() => {
    // When the value changes, kick off the animation.
    // Small delay ensures the SVG is mounted before animation starts.
    const timer = setTimeout(() => {
      setAnimatedOffset(progressOffset);
    }, 50);

    return () => clearTimeout(timer);
  }, [progressOffset]); // Re-animate if the calculation changes

  // 5. SVG Path definitions (The background arc)
  // We use SVG commands: M=MoveTo, A=Arc
  const pathData = `
    M 30,165 
    A ${RADIUS} ${RADIUS} 0 1 1 170,165
  `;

  return (
    <div className="relative flex flex-col items-center justify-center">
      {/* THE GAUGE (SVG Layer) */}
      {/* Define the ViewBox to ensure consistent aspect ratio and sizing */}
      <svg
        viewBox="0 0 200 180"
        className="w-full h-auto aspect-[10/9]"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* A gradient for the moving needle */}
          <linearGradient id="needleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#1e3a8a" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* 1. Background Arc (Light Gray) */}
        <path
          d={pathData}
          fill="none"
          stroke="#e2e8f0" // slate-200
          strokeWidth="20"
          strokeLinecap="round"
        />

        {/* 2. Moving Progress Arc (Dark Blue) */}
        <path
          d={pathData}
          fill="none"
          stroke="#1e3a8a" // navy-800
          strokeWidth="20"
          strokeLinecap="round"
          // Crucial: Use the circumference calculation
          strokeDasharray={CIRCUMFERENCE}
          // The moving offset is tied to the value!
          strokeDashoffset={animatedOffset}
          // CSS Transition makes the change smooth
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />

        {/* 3. The Moving Needle */}
        {/* We use a simple rectangle/line and rotate it */}
        <line
          x1="100" // Pivot point (center)
          y1="100"
          x2="175" // Point point (tip)
          y2="100"
          stroke="url(#needleGradient)" // Optional: use gradient for tip look
          strokeWidth="3"
          strokeLinecap="round"
          style={{
            transformOrigin: '100px 100px', // Rotate around center
            // Rotate calculation: Start angle + active percentage of range
            transform: `rotate(${START_ANGLE + activeDegrees}deg)`,
            transition: 'transform 0.8s ease-out', // Match progress arc duration
          }}
        />
      </svg>

      {/* THE NUMBER (Text Layer, centered below) */}
      <div className="absolute bottom-6 flex flex-col items-center">
        <p className="text-xl font-bold text-slate-900">{value}</p>
        <p className="text-sm font-medium text-slate-500">{unit}</p>
      </div>
    </div>
  );
}
