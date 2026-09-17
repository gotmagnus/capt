"use client";

import { useMemo, useState } from "react";
import { addMonths } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Stat } from "@/components/ui/page";
import { Switch } from "@/components/ui/misc";
import { FormDialog } from "@/components/forms";
import { percent, shares } from "@/lib/format";
import { saveScenario } from "@/app/app/[companyId]/employees/actions";

interface ScenarioDto {
  id: string;
  name: string;
  params: Record<string, unknown>;
}

export function PoolForecast({
  companyId,
  poolAvailable,
  poolAuthorized,
  fullyDiluted,
  unvestedOptions,
  suggestedRefreshTotal,
  hiringScenarios,
  forecastScenarios,
}: {
  companyId: string;
  poolAvailable: number;
  poolAuthorized: number;
  fullyDiluted: number;
  unvestedOptions: number;
  suggestedRefreshTotal: number;
  hiringScenarios: ScenarioDto[];
  forecastScenarios: ScenarioDto[];
}) {
  const [horizon, setHorizon] = useState<12 | 24 | 36>(24);
  const [attrition, setAttrition] = useState(10);
  const [hiringId, setHiringId] = useState(hiringScenarios[0]?.id ?? "");
  const [includeRefresh, setIncludeRefresh] = useState(true);
  const [hiringMonths, setHiringMonths] = useState(12);

  const hiringShares = useMemo(() => {
    const sc = hiringScenarios.find((s) => s.id === hiringId);
    const hires = (sc?.params.hires as { count?: number; equity?: number }[] | undefined) ?? [];
    return hires.reduce((a, h) => a + Number(h.count ?? 1) * Number(h.equity ?? 0), 0);
  }, [hiringScenarios, hiringId]);

  const series = useMemo(() => {
    const out: { month: string; balance: number; hires: number; refreshes: number; forfeitures: number }[] = [];
    let balance = poolAvailable;
    const start = new Date();
    for (let i = 1; i <= horizon; i++) {
      const hires = i <= hiringMonths ? hiringShares / hiringMonths : 0;
      const refreshes = includeRefresh && i <= 12 ? suggestedRefreshTotal / 12 : 0;
      const forfeitures = (unvestedOptions * (attrition / 100)) / 12;
      balance = balance - hires - refreshes + forfeitures;
      const d = addMonths(start, i);
      out.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, balance: Math.round(balance), hires: Math.round(hires), refreshes: Math.round(refreshes), forfeitures: Math.round(forfeitures) });
    }
    return out;
  }, [horizon, attrition, hiringShares, includeRefresh, hiringMonths, poolAvailable, suggestedRefreshTotal, unvestedOptions]);

  const runsOut = series.find((s) => s.balance < 0);
  const minBalance = Math.min(...series.map((s) => s.balance));
  const recommendedIncrease = minBalance < 0 ? Math.ceil(-minBalance / 50_000) * 50_000 : 0;
  const endBalance = series[series.length - 1]?.balance ?? poolAvailable;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Pool available today" value={shares(poolAvailable)} hint={`${percent(fullyDiluted ? poolAvailable / fullyDiluted : 0, 1)} of fully diluted · ${shares(poolAuthorized)} authorized`} />
        <Stat label="Planned hiring" value={shares(hiringShares)} hint={`Over ${hiringMonths} months`} />
        <Stat label={`Balance after ${horizon} months`} value={shares(endBalance)} tone={endBalance < 0 ? "danger" : "default"} hint={runsOut ? `Runs out ${runsOut.month}` : "Does not run out"} />
        <Stat label="Recommended increase" value={recommendedIncrease ? shares(recommendedIncrease) : "None"} tone={recommendedIncrease ? "warning" : "success"} hint={recommendedIncrease ? `${percent(recommendedIncrease / (fullyDiluted + recommendedIncrease), 2)} dilution` : "Pool is sufficient"} />
      </div>
      <div className="grid gap-5 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader className="flex-col sm:flex-row">
            <div className="min-w-0">
              <CardTitle>Projected unallocated pool</CardTitle>
              <CardDescription>Monthly balance after hiring, refresh grants and expected forfeitures</CardDescription>
            </div>
            <FormDialog
              trigger={
                <Button size="sm" className="shrink-0">
                  <Save /> Save forecast
                </Button>
              }
              title="Save pool forecast"
              action={saveScenario}
              hidden={{ companyId, type: "POOL_FORECAST", params: JSON.stringify({ horizon, attrition, hiringScenarioId: hiringId, includeRefresh, hiringMonths }), results: JSON.stringify({ runsOut: runsOut?.month ?? null, minBalance, recommendedIncrease, endBalance }) }}
            >
              <Field label="Forecast name">
                <Input name="name" defaultValue={`Pool forecast — ${horizon}m, ${attrition}% attrition`} required />
              </Field>
              <Field label="Description">
                <Input name="description" placeholder="Optional" />
              </Field>
            </FormDialog>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eef0f3" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#667085" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "#667085" }} tickLine={false} axisLine={false} tickFormatter={(v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1e3)}K`)} width={48} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e4e7ec" }} formatter={(v, n) => [shares(Number(v)), n === "balance" ? "Pool balance" : String(n)]} cursor={{ fill: "#f1f2f4" }} />
                <ReferenceLine y={0} stroke="#b42318" strokeDasharray="4 4" />
                <Bar dataKey="balance" radius={[3, 3, 0, 0]}>
                  {series.map((s, i) => (
                    <Cell key={i} fill={s.balance < 0 ? "#b42318" : s.balance < poolAvailable * 0.2 ? "#dc6803" : "#1d4ed8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {runsOut ? (
              <Alert tone="warning" icon={AlertTriangle} className="mt-4" title={`Pool runs out in ${runsOut.month}`}>
                Increase the plan reserve by {shares(recommendedIncrease)} shares before then, or slow hiring. Draft a board consent under Board consents → Equity plan.
              </Alert>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Assumptions</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Horizon">
              <Select value={horizon} onChange={(e) => setHorizon(Number(e.target.value) as 12 | 24 | 36)}>
                <option value={12}>12 months</option>
                <option value={24}>24 months</option>
                <option value={36}>36 months</option>
              </Select>
            </Field>
            <Field label="Hiring plan">
              <Select value={hiringId} onChange={(e) => setHiringId(e.target.value)}>
                <option value="">No hiring</option>
                {hiringScenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Hiring spread over (months)">
              <Input type="number" min={1} max={horizon} value={hiringMonths} onChange={(e) => setHiringMonths(Math.max(1, Math.min(horizon, Number(e.target.value))))} />
            </Field>
            <Field label="Annual attrition" hint={`Returns ${shares(Math.round(unvestedOptions * (attrition / 100)))} unvested options per year`}>
              <Input type="number" min={0} max={100} value={attrition} onChange={(e) => setAttrition(Math.max(0, Math.min(100, Number(e.target.value))))} suffix="%" />
            </Field>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px]">Include suggested refreshes ({shares(suggestedRefreshTotal)})</span>
              <Switch checked={includeRefresh} onCheckedChange={setIncludeRefresh} />
            </div>
            {forecastScenarios.length ? (
              <div className="border-t border-border pt-3 text-xs text-muted-foreground">
                Saved forecasts: {forecastScenarios.map((s) => s.name).join(", ")}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
