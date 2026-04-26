"use client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatAEDShort } from "@/lib/calculations";

interface DataPoint {
  month: string;
  revenueAtRisk: number;
  avgHealth: number;
  redProjects: number;
}

export function PortfolioOutlookChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a2d45" />
        <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={(v) => formatAEDShort(v)}
          tick={{ fill: "#64748b", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={55}
        />
        <Tooltip
          contentStyle={{ background: "#0d1424", border: "1px solid #1a2d45", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
          formatter={(value: number) => [`AED ${(value / 1_000_000).toFixed(0)}M`, "Revenue at Risk"]}
        />
        <Area
          type="monotone"
          dataKey="revenueAtRisk"
          stroke="#ef4444"
          strokeWidth={2}
          fill="url(#riskGrad)"
          dot={{ fill: "#ef4444", r: 3 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
