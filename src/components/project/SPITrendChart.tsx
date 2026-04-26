"use client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from "recharts";
import type { SPIDataPoint } from "@/lib/types";

export function SPITrendChart({ data }: { data: SPIDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a2d45" />
        <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0.6, 1.2]} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
        <Tooltip
          contentStyle={{ background: "#0d1424", border: "1px solid #1a2d45", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
        />
        <ReferenceLine y={1.0} stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1} label={{ value: "Target", fill: "#3b82f6", fontSize: 10, position: "right" }} />
        <Line type="monotone" dataKey="spi" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 3 }} name="SPI" />
        <Line type="monotone" dataKey="cpi" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 3 }} strokeDasharray="5 3" name="CPI" />
      </LineChart>
    </ResponsiveContainer>
  );
}
