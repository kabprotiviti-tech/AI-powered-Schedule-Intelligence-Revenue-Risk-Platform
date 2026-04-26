"use client";
import { healthColor } from "@/lib/calculations";

interface Props {
  score: number;
  size?: number;
  label?: string;
  showFormula?: boolean;
}

export function HealthGauge({ score, size = 120, label }: Props) {
  const radius = (size - 16) / 2;
  const circumference = Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const color = healthColor(score);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size / 2 + 20 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
          {/* Background arc */}
          <path
            d={`M 8 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2}`}
            fill="none"
            stroke="#1a2d45"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d={`M 8 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2}`}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.4s ease" }}
          />
        </svg>
        {/* Score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className="text-2xl font-bold" style={{ color }}>{score}</span>
          <span className="text-[10px] text-text-secondary uppercase tracking-wider">/100</span>
        </div>
      </div>
      {label && <span className="text-xs text-text-secondary">{label}</span>}
    </div>
  );
}
