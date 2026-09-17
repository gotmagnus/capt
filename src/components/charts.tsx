"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactMoney, percent, shares } from "@/lib/format";

export const CHART_COLORS = ["#1d4ed8", "#0e9384", "#7a5af8", "#dc6803", "#c11574", "#475467", "#16b364", "#e04f16", "#0ea5e9", "#a15c07"];

const tooltipStyle = { fontSize: 12, borderRadius: 8, border: "1px solid #e4e7ec", boxShadow: "0 4px 12px rgba(16,24,40,0.08)" };

export function OwnershipDonut({ data, height = 220, valueKey = "value" }: { data: { name: string; value: number }[]; height?: number; valueKey?: string }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={1} stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`${shares(Number(v))} (${percent(total ? Number(v) / total : 0)})`, String(n)]} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function LegendList({ data, total }: { data: { name: string; value: number }[]; total?: number }) {
  const t = total ?? data.reduce((a, d) => a + d.value, 0);
  return (
    <ul className="space-y-1.5 text-[13px]">
      {data.map((d, i) => (
        <li key={d.name} className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
          <span className="flex-1 truncate">{d.name}</span>
          <span className="tabular text-muted-foreground">{percent(t ? d.value / t : 0, 1)}</span>
        </li>
      ))}
    </ul>
  );
}

export function VestingAreaChart({ data, height = 220 }: { data: { month: string; vesting: number; cumulative: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="vestFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#eef0f3" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#667085" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: "#667085" }} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v)} width={44} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [shares(Number(v)), n === "cumulative" ? "Cumulative vested" : "Vesting"]} />
        <Area type="monotone" dataKey="cumulative" stroke="#1d4ed8" strokeWidth={2} fill="url(#vestFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MonthlyBarChart({ data, dataKey = "value", height = 220, money = true, color = "#1d4ed8" }: { data: Record<string, number | string>[]; dataKey?: string; height?: number; money?: boolean; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eef0f3" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#667085" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: "#667085" }} tickLine={false} axisLine={false} tickFormatter={(v) => (money ? compactMoney(v) : shares(v))} width={52} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [money ? compactMoney(Number(v)) : shares(Number(v))]} cursor={{ fill: "#f1f2f4" }} />
        <Bar dataKey={dataKey} fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WaterfallLineChart({ data, series, height = 280 }: { data: Record<string, number | string>[]; series: { key: string; name: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eef0f3" />
        <XAxis dataKey="exitValue" type="number" domain={["dataMin", "dataMax"]} tickCount={6} minTickGap={24} tick={{ fontSize: 11, fill: "#667085" }} tickLine={false} axisLine={false} tickFormatter={(v) => compactMoney(v)} />
        <YAxis tick={{ fontSize: 11, fill: "#667085" }} tickLine={false} axisLine={false} tickFormatter={(v) => compactMoney(v)} width={56} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [compactMoney(Number(v))]} labelFormatter={(l) => `Exit at ${compactMoney(Number(l))}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function StackedBarChart({ data, series, xKey = "name", height = 260, money = false }: { data: Record<string, number | string>[]; series: { key: string; name: string }[]; xKey?: string; height?: number; money?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eef0f3" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#667085" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#667085" }} tickLine={false} axisLine={false} tickFormatter={(v) => (money ? compactMoney(v) : shares(v))} width={52} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [money ? compactMoney(Number(v)) : shares(Number(v))]} cursor={{ fill: "#f1f2f4" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} radius={i === series.length - 1 ? [3, 3, 0, 0] : 0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
