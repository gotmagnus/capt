"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { price } from "@/lib/format";

export function FmvHistoryChart({ data, height = 220 }: { data: { date: string; label: string; fmv: number | null; preferred: number | null }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eef0f3" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#667085" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#667085" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} width={52} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e4e7ec", boxShadow: "0 4px 12px rgba(16,24,40,0.08)" }} formatter={(v, n) => [price(Number(v)), n === "fmv" ? "Common FMV (409A)" : "Preferred price"]} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === "fmv" ? "Common FMV (409A)" : "Preferred price")} />
        <Line type="stepAfter" dataKey="fmv" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        <Line type="stepAfter" dataKey="preferred" stroke="#0e9384" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 3" connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
