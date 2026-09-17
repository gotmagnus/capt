"use client";

import { useMemo, useState } from "react";
import { computeWaterfall, type HolderOutcome, type WaterfallHolding } from "@/lib/equity/waterfall";
import type { ShareClassLike } from "@/lib/equity/captable";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/page";
import { DataTable, type Column } from "@/components/data-table";
import { WaterfallLineChart } from "@/components/charts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { compactMoney, money, multiple, percent, price, shares } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RELATIONSHIP_LABELS, type StakeholderRelationship } from "@/lib/types";
import { ScenarioBar, type ScenarioSummary } from "../scenario-bar";

const relationshipLabel = (r: string) => RELATIONSHIP_LABELS[r as StakeholderRelationship] ?? r.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
// First column stays put while a wide table scrolls sideways on small screens.
const stickyTh = "sticky left-0 z-[2] max-lg:shadow-[1px_0_0_var(--border)]";
// Card tables: line the outer columns up with the card's own padding.
const cardTable = "px-0 pb-0 [&_td:first-child]:pl-5 [&_th:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:last-child]:pr-5";
const stickyTd = "sticky left-0 z-[1] bg-card [tr:hover>&]:bg-[#fafbfc] max-lg:shadow-[1px_0_0_var(--border)]";

export interface ExitParams {
  exitValue: number;
  debt: number;
  transactionCostPct: number;
  includeUnvestedOptions: boolean;
  includeUnallocatedPool: boolean;
  accrueDividends: boolean;
}

export function ExitModeler({
  companyId,
  canEdit,
  holdings,
  shareClasses,
  unallocatedPool,
  accruedDividends,
  scenarios,
  initialScenarioId,
  initialParams,
  defaults,
  lastRound,
}: {
  companyId: string;
  canEdit: boolean;
  holdings: WaterfallHolding[];
  shareClasses: ShareClassLike[];
  unallocatedPool: number;
  accruedDividends: Record<string, number>;
  scenarios: ScenarioSummary[];
  initialScenarioId: string | null;
  initialParams: ExitParams;
  defaults: ExitParams;
  lastRound: { name: string; postMoneyValuation: number | null } | null;
}) {
  const [scenarioId, setScenarioId] = useState<string | null>(initialScenarioId);
  const [p, setP] = useState<ExitParams>(initialParams);
  const [series, setSeries] = useState<"classes" | "holders">("classes");
  const set = (patch: Partial<ExitParams>) => setP((x) => ({ ...x, ...patch }));

  const base = useMemo(
    () => ({ shareClasses, holdings, debt: p.debt, transactionCostPct: p.transactionCostPct, includeUnvestedOptions: p.includeUnvestedOptions, unallocatedPool: p.includeUnallocatedPool ? unallocatedPool : 0, accruedDividends: p.accrueDividends ? accruedDividends : undefined }),
    [shareClasses, holdings, p, unallocatedPool, accruedDividends],
  );
  const result = useMemo(() => computeWaterfall({ ...base, exitValue: Number(p.exitValue) || 0 }), [base, p.exitValue]);

  const prefStack = result.classes.filter((c) => c.shareClassId).reduce((a, c) => a + c.preference, 0);
  const maxExit = Math.max((Number(p.exitValue) || 0) * 2.5, prefStack * 6, 1_000_000);
  const curve = useMemo(() => {
    const points = 40;
    return Array.from({ length: points + 1 }, (_, i) => Math.round((maxExit * i) / points)).map((exitValue) => ({ exitValue, r: computeWaterfall({ ...base, exitValue }) }));
  }, [base, maxExit]);

  const topHolders = result.holders.slice(0, 5);
  const chartData = curve.map(({ exitValue, r }) => {
    const row: Record<string, number | string> = { exitValue };
    for (const c of r.classes) row[c.name] = Math.round(c.total);
    for (const h of topHolders) row[h.name] = Math.round(r.holders.find((x) => x.stakeholderId === h.stakeholderId)?.proceeds ?? 0);
    return row;
  });
  const chartSeries = series === "classes" ? result.classes.map((c) => ({ key: c.name, name: c.name })) : topHolders.map((h) => ({ key: h.name, name: h.name }));

  // Breakpoints: first exit value at which each non-participating (or capped) class converts, refined by bisection.
  const breakpoints = useMemo(() => {
    const out: { name: string; kind: string; exitValue: number | null }[] = [];
    const prefClasses = shareClasses.filter((c) => c.type === "PREFERRED");
    for (const cls of prefClasses) {
      const converts = (v: number) => computeWaterfall({ ...base, exitValue: v }).classes.find((c) => c.shareClassId === cls.id)?.converted ?? false;
      let lo = 0;
      let hi: number | null = null;
      for (const pt of curve) {
        if (converts(pt.exitValue)) {
          hi = pt.exitValue;
          break;
        }
        lo = pt.exitValue;
      }
      if (hi == null) {
        out.push({ name: cls.name, kind: cls.participating ? (cls.participationCap ? "Converts above participation cap" : "Participating — never converts") : "Converts to common", exitValue: null });
        continue;
      }
      let upper: number = hi;
      for (let i = 0; i < 24; i++) {
        const mid: number = (lo + upper) / 2;
        if (converts(mid)) upper = mid;
        else lo = mid;
      }
      out.push({ name: cls.name, kind: cls.participating ? "Converts above participation cap" : "Converts to common", exitValue: Math.round(upper) });
    }
    out.push({ name: "Common", kind: "Common starts receiving proceeds", exitValue: Math.round(prefStack / (1 - p.transactionCostPct / 100) + p.debt) });
    return out.sort((a, b) => (a.exitValue ?? Infinity) - (b.exitValue ?? Infinity));
  }, [base, curve, shareClasses, prefStack, p.transactionCostPct, p.debt]);

  const holderColumns: Column<HolderOutcome>[] = [
    {
      key: "name",
      header: "Stakeholder",
      sortValue: (h) => h.name,
      cell: (h) => (
        <div className="max-sm:max-w-[9.5rem]">
          <span className="block truncate font-medium" title={h.name}>
            {h.name}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground sm:hidden">
            {relationshipLabel(h.relationship)} · {percent(h.pctOfProceeds)}
          </span>
        </div>
      ),
    },
    { key: "rel", header: "Relationship", className: "max-sm:hidden", sortValue: (h) => h.relationship, cell: (h) => <span className="text-muted-foreground">{relationshipLabel(h.relationship)}</span> },
    { key: "proceeds", header: "Proceeds", align: "right", sortValue: (h) => h.proceeds, cell: (h) => <span className="font-medium">{money(h.proceeds)}</span> },
    { key: "pct", header: "% of proceeds", align: "right", className: "max-sm:hidden", sortValue: (h) => h.pctOfProceeds, cell: (h) => percent(h.pctOfProceeds) },
    { key: "invested", header: "Invested", align: "right", className: "max-sm:hidden", sortValue: (h) => h.invested, cell: (h) => (h.invested > 0 ? money(h.invested) : "—") },
    { key: "moic", header: "MOIC", align: "right", sortValue: (h) => h.moic ?? -1, cell: (h) => (h.moic != null ? <span className={cn(h.moic >= 1 ? "text-success" : "text-danger")}>{multiple(h.moic)}</span> : "—") },
    {
      key: "breakdown",
      header: "Breakdown",
      className: "max-sm:hidden",
      cell: (h) => (
        <details data-no-row className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {h.breakdown.length} securit{h.breakdown.length === 1 ? "y" : "ies"}
          </summary>
          <ul className="mt-1 space-y-0.5">
            {h.breakdown.map((b) => (
              <li key={b.securityId} className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  {b.className} · {shares(b.shares)}
                  {b.exerciseCost ? ` (exercise ${money(b.exerciseCost)})` : ""}
                </span>
                <span className="tabular">{money(b.proceeds)}</span>
              </li>
            ))}
          </ul>
        </details>
      ),
    },
  ];

  const vsCurrent = (exitValue: number | null) => (exitValue != null && p.exitValue ? <Badge variant={exitValue <= p.exitValue ? "success" : "neutral"}>{exitValue <= p.exitValue ? "Reached" : `${multiple(exitValue / p.exitValue)} away`}</Badge> : null);

  const load = (s: ScenarioSummary) => {
    setScenarioId(s.id);
    setP({ ...defaults, ...(JSON.parse(s.params) as Partial<ExitParams>) });
  };
  const reset = () => {
    setScenarioId(null);
    setP(defaults);
  };
  const results = { distributable: result.distributable, commonPricePerShare: result.commonPricePerShare, totalPreferencePaid: result.totalPreferencePaid, totalToCommon: result.totalToCommon };

  return (
    <div className="space-y-5">
      <ScenarioBar companyId={companyId} type="EXIT" scenarios={scenarios} currentId={scenarioId} params={p} results={results} onLoad={load} onNew={reset} canEdit={canEdit} basePath={`/app/${companyId}/modeling/exit`} />

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="xl:sticky xl:top-[4.5rem] xl:self-start">
          <CardHeader>
            <div>
              <CardTitle>Exit assumptions</CardTitle>
              <CardDescription>{lastRound?.postMoneyValuation ? `${lastRound.name} post-money: ${compactMoney(lastRound.postMoneyValuation)}` : "Enter an enterprise value"}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Exit value">
              <Input type="number" prefix="$" step={1_000_000} min={0} value={p.exitValue || ""} onChange={(e) => set({ exitValue: Number(e.target.value) })} />
            </Field>
            <input type="range" min={0} max={maxExit} step={maxExit / 200} value={Math.min(p.exitValue, maxExit)} onChange={(e) => set({ exitValue: Math.round(Number(e.target.value)) })} className="h-6 w-full cursor-pointer accent-blue-600" aria-label="Exit value slider" />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>$0</span>
              <span>{compactMoney(maxExit)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Debt repaid">
                <Input type="number" prefix="$" step={100_000} min={0} value={p.debt || ""} onChange={(e) => set({ debt: Number(e.target.value) })} />
              </Field>
              <Field label="Transaction costs">
                <Input type="number" suffix="%" step={0.5} min={0} max={20} value={p.transactionCostPct} onChange={(e) => set({ transactionCostPct: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="space-y-2 border-t border-border pt-3">
              <label className="flex items-center justify-between gap-3 text-[13px]">
                <span>Accelerate unvested options</span>
                <Switch checked={p.includeUnvestedOptions} onCheckedChange={(v) => set({ includeUnvestedOptions: v })} />
              </label>
              <label className="flex items-center justify-between gap-3 text-[13px]">
                <span>Include unallocated pool ({shares(unallocatedPool)})</span>
                <Switch checked={p.includeUnallocatedPool} onCheckedChange={(v) => set({ includeUnallocatedPool: v })} />
              </label>
              {Object.keys(accruedDividends).length ? (
                <label className="flex items-center justify-between gap-3 text-[13px]">
                  <span>Add accrued dividends ({compactMoney(Object.values(accruedDividends).reduce((a, b) => a + b, 0))})</span>
                  <Switch checked={p.accrueDividends} onCheckedChange={(v) => set({ accrueDividends: v })} />
                </label>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Distributable" value={compactMoney(result.distributable)} hint={`after ${compactMoney(result.debt + result.transactionCosts)} debt & costs${result.exerciseProceeds ? ` + ${compactMoney(result.exerciseProceeds)} exercise` : ""}`} />
            <Stat label="To preferences" value={compactMoney(result.totalPreferencePaid)} hint={`${compactMoney(prefStack)} total stack`} />
            <Stat label="Common per share" value={price(result.commonPricePerShare)} hint={`${compactMoney(result.totalToCommon)} to common`} />
            <Stat label="Solver" value={`${result.iterations + 1} pass${result.iterations ? "es" : ""}`} hint={`${result.classes.filter((c) => c.converted).length} class${result.classes.filter((c) => c.converted).length === 1 ? "" : "es"} convert`} />
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>By share class</CardTitle>
                <CardDescription>Preference paid by seniority, then residual shared with common</CardDescription>
              </div>
            </CardHeader>
            <CardContent className={cardTable}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th className={stickyTh}>Class</th>
                    <th className="text-right">Shares</th>
                    <th className="text-right">Preference</th>
                    <th className="text-right">Pref. paid</th>
                    <th className="text-right">Participation</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Per share</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {result.classes.map((c) => (
                    <tr key={c.name}>
                      <td className={cn(stickyTd, "font-medium")}>{c.name}</td>
                      <td className="num">{shares(c.shares)}</td>
                      <td className="num">{c.preference ? money(c.preference) : "—"}</td>
                      <td className="num">{c.preferencePaid ? money(c.preferencePaid) : "—"}</td>
                      <td className="num">{c.participation ? money(c.participation) : "—"}</td>
                      <td className="num font-medium">{money(c.total)}</td>
                      <td className="num">{price(c.perShare)}</td>
                      <td>
                        {c.shareClassId ? (
                          <span className="flex gap-1">
                            {c.converted ? <Badge variant="accent">Converted</Badge> : <Badge variant="info">Takes preference</Badge>}
                            {c.participating && !c.converted ? <Badge variant="purple">{c.capped ? "Capped" : "Participates"}</Badge> : null}
                          </span>
                        ) : (
                          <Badge variant="neutral">Residual</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-col gap-3 sm:flex-row sm:gap-4">
              <div>
                <CardTitle>Payout curve</CardTitle>
                <CardDescription>Proceeds across exit values up to {compactMoney(maxExit)}</CardDescription>
              </div>
              <Tabs value={series} onValueChange={(v) => setSeries(v as "classes" | "holders")}>
                <TabsList variant="pills" className="h-8">
                  <TabsTrigger value="classes" className="border-0 pb-0 pt-0 px-2 data-[state=active]:bg-card data-[state=active]:rounded data-[state=active]:shadow-sm">
                    Classes
                  </TabsTrigger>
                  <TabsTrigger value="holders" className="border-0 pb-0 pt-0 px-2 data-[state=active]:bg-card data-[state=active]:rounded data-[state=active]:shadow-sm">
                    Top 5 holders
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              <WaterfallLineChart data={chartData} series={chartSeries} height={260} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Breakpoints</CardTitle>
                <CardDescription>Exit values where a class's best decision changes</CardDescription>
              </div>
            </CardHeader>
            <CardContent className={cardTable}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Event</th>
                    <th className="text-right">Exit value</th>
                    <th className="text-right max-sm:hidden">vs. current</th>
                  </tr>
                </thead>
                <tbody>
                  {breakpoints.map((b) => (
                    <tr key={b.name}>
                      <td className="font-medium max-sm:min-w-[6.5rem] max-sm:whitespace-normal">{b.name}</td>
                      <td className="min-w-[7rem] whitespace-normal text-muted-foreground">{b.kind}</td>
                      <td className="num">
                        {b.exitValue != null ? compactMoney(b.exitValue) : <span className="text-muted-foreground">above {compactMoney(maxExit)}</span>}
                        {vsCurrent(b.exitValue) ? <div className="mt-1 sm:hidden">{vsCurrent(b.exitValue)}</div> : null}
                      </td>
                      <td className="num max-sm:hidden">{vsCurrent(b.exitValue) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>

      <DataTable rows={result.holders} columns={holderColumns} rowKey={(h) => h.stakeholderId} searchable={(h) => `${h.name} ${h.relationship}`} searchPlaceholder="Search stakeholders…" defaultSort={{ key: "proceeds", dir: "desc" }} dense className="max-sm:[&_td]:px-2 max-sm:[&_th]:px-2 max-sm:[&_td:first-child]:pl-4 max-sm:[&_th:first-child]:pl-4 max-sm:[&_td:last-child]:pr-4 max-sm:[&_th:last-child]:pr-4" />
      <p className="text-xs text-muted-foreground">Options are exercised only when in the money; exercise proceeds are added to distributable value. Non-participating preferred converts when as-converted value exceeds its preference; capped participating preferred converts above the cap.</p>
    </div>
  );
}
