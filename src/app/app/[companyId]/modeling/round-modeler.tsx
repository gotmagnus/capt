"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { dilutionGrid, modelRound, type ProFormaRow } from "@/lib/equity/round-model";
import type { CapTableSummary } from "@/lib/equity/captable";
import type { ConvertibleInput } from "@/lib/equity/conversion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Stat, Alert } from "@/components/ui/page";
import { DataTable, type Column } from "@/components/data-table";
import { OwnershipDonut, LegendList } from "@/components/charts";
import { compactMoney, money, percent, price, shares } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ScenarioBar, type ScenarioSummary } from "./scenario-bar";

export interface RoundModelParams {
  preMoneyValuation: number;
  investors: { name: string; amount: number; stakeholderId?: string | null }[];
  targetPoolPct: number | null;
  poolTiming: "PRE" | "POST";
  convertSafes: boolean;
  convertNotes: boolean;
  applyMfn: boolean;
  newShareClassName: string;
}

type Conv = ConvertibleInput & { certificateNumber: string; holderName: string };

const GROUPS: { key: string; label: string; match: (r: ProFormaRow) => boolean }[] = [
  { key: "founders", label: "Founders", match: (r) => r.kind === "EXISTING" && r.relationship === "FOUNDER" },
  { key: "investors", label: "Existing investors", match: (r) => (r.kind === "EXISTING" || r.kind === "CONVERSION") && r.relationship === "INVESTOR" },
  { key: "new", label: "New investors", match: (r) => r.kind === "NEW_INVESTOR" },
  { key: "employees", label: "Employees", match: (r) => r.kind === "EXISTING" && (r.relationship === "EMPLOYEE" || r.relationship === "FORMER_EMPLOYEE") },
  { key: "advisors", label: "Advisors & other", match: (r) => r.kind === "EXISTING" && !["FOUNDER", "INVESTOR", "EMPLOYEE", "FORMER_EMPLOYEE"].includes(r.relationship) },
  { key: "pool", label: "Unallocated pool", match: (r) => r.kind === "POOL" },
];

export function RoundModeler({
  companyId,
  canEdit,
  summary,
  convertibles,
  stakeholders,
  scenarios,
  initialScenarioId,
  initialParams,
  defaults,
  currentFmv,
  lastRound,
}: {
  companyId: string;
  canEdit: boolean;
  summary: CapTableSummary;
  convertibles: Conv[];
  stakeholders: { id: string; name: string; relationship: string; fdPct: number }[];
  scenarios: ScenarioSummary[];
  initialScenarioId: string | null;
  initialParams: RoundModelParams;
  defaults: RoundModelParams;
  currentFmv: number | null;
  lastRound: { name: string; pricePerShare: number | null; postMoneyValuation: number | null } | null;
}) {
  const [scenarioId, setScenarioId] = useState<string | null>(initialScenarioId);
  const [p, setP] = useState<RoundModelParams>(initialParams);
  const [gridHolder, setGridHolder] = useState<string>(stakeholders.find((s) => s.relationship === "FOUNDER")?.id ?? stakeholders[0]?.id ?? "");
  const set = (patch: Partial<RoundModelParams>) => setP((x) => ({ ...x, ...patch }));

  const totalRaise = p.investors.reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const model = useMemo(
    () =>
      modelRound({
        capTable: summary,
        preMoneyValuation: Number(p.preMoneyValuation) || 0,
        investors: p.investors.filter((i) => i.amount > 0).map((i, idx) => ({ id: String(idx), name: i.name || `Investor ${idx + 1}`, amount: Number(i.amount), stakeholderId: i.stakeholderId ?? null })),
        targetPoolPct: p.targetPoolPct,
        poolTiming: p.poolTiming,
        convertibles,
        convertSafes: p.convertSafes,
        convertNotes: p.convertNotes,
        applyMfn: p.applyMfn,
        newShareClassName: p.newShareClassName,
      }),
    [summary, p, convertibles],
  );

  const grid = useMemo(() => {
    const base = { capTable: summary, targetPoolPct: p.targetPoolPct, poolTiming: p.poolTiming, convertibles, convertSafes: p.convertSafes, convertNotes: p.convertNotes, applyMfn: p.applyMfn };
    const pm = Number(p.preMoneyValuation) || 1;
    const rs = totalRaise || 1;
    return dilutionGrid(base, [0.6, 0.8, 1, 1.2, 1.5].map((m) => Math.round(pm * m)), [0.6, 0.8, 1, 1.25, 1.5].map((m) => Math.round(rs * m)), gridHolder || undefined);
  }, [summary, p, convertibles, totalRaise, gridHolder]);

  const before = summary.groups.map((g) => ({ name: g.label, value: g.fullyDilutedShares }));
  const after = GROUPS.map((g) => ({ name: g.label, value: model.rows.filter((r) => r.kind !== "TOTAL" && g.match(r)).reduce((a, r) => a + r.postShares, 0) })).filter((g) => g.value > 0);

  // Share counts fold under the holder name on phones so the ownership columns fit without scrolling.
  const phoneHidden = "max-sm:hidden";
  // The holder column stays put when the table has to scroll sideways (tablets, small laptops).
  const stickyCol = "sticky left-0 z-[1] [&:is(td)]:bg-card [tr:hover>&:is(td)]:bg-[#fafbfc] [&:is(th)]:z-[2] max-xl:shadow-[1px_0_0_var(--border)]";
  const columns: Column<ProFormaRow>[] = [
    {
      key: "name",
      header: "Holder",
      className: stickyCol,
      sortValue: (r) => r.name,
      cell: (r) => {
        const proRata = r.kind === "EXISTING" && r.investedThisRound > 0;
        const converted = r.kind === "EXISTING" && r.newShares > 0 && (!proRata || r.newShares > Math.floor(r.investedThisRound / (model.pricePerShare || 1)));
        return (
          <div className="max-sm:max-w-[9.25rem]">
            <span className="flex items-center gap-1.5">
              <span className="truncate" title={r.name}>
                {r.name}
              </span>
              {r.kind === "NEW_INVESTOR" ? <Badge variant="accent">New</Badge> : r.kind === "CONVERSION" ? <Badge variant="info">Conversion</Badge> : null}
              {proRata ? <Badge variant="outline">Pro-rata</Badge> : null}
              {converted ? <Badge variant="info">Conversion</Badge> : null}
            </span>
            <span className="block truncate text-[11px] tabular text-muted-foreground sm:hidden">
              {shares(r.postShares)} sh{r.newShares && r.preShares ? ` · +${shares(r.newShares)}` : ""}
            </span>
          </div>
        );
      },
    },
    { key: "pre", header: "Pre shares", align: "right", className: phoneHidden, sortValue: (r) => r.preShares, cell: (r) => shares(r.preShares) },
    { key: "prePct", header: "Pre %", align: "right", sortValue: (r) => r.prePct, cell: (r) => percent(r.prePct) },
    {
      key: "new",
      header: "New shares",
      align: "right",
      className: phoneHidden,
      sortValue: (r) => r.newShares,
      cell: (r) =>
        r.newShares ? (
          <>
            {shares(r.newShares)}
            {r.investedThisRound ? <span className="block text-[11px] text-muted-foreground">{money(r.investedThisRound)} invested</span> : null}
          </>
        ) : (
          "—"
        ),
    },
    { key: "post", header: "Post shares", align: "right", className: phoneHidden, sortValue: (r) => r.postShares, cell: (r) => shares(r.postShares) },
    { key: "postPct", header: "Post %", align: "right", sortValue: (r) => r.postPct, cell: (r) => <span className="font-medium">{percent(r.postPct)}</span> },
    { key: "delta", header: "Δ pp", align: "right", sortValue: (r) => r.dilutionPct, cell: (r) => <span className={cn(r.dilutionPct < -0.005 ? "text-danger" : r.dilutionPct > 0.005 ? "text-success" : "text-muted-foreground")}>{r.dilutionPct ? `${r.dilutionPct > 0 ? "+" : ""}${r.dilutionPct.toFixed(2)}` : "—"}</span> },
  ];
  const holderRows = model.rows.filter((r) => r.kind !== "TOTAL");
  const totalRow = model.rows.find((r) => r.kind === "TOTAL");

  const load = (s: ScenarioSummary) => {
    setScenarioId(s.id);
    setP({ ...defaults, ...(JSON.parse(s.params) as Partial<RoundModelParams>) });
  };
  const reset = () => {
    setScenarioId(null);
    setP(defaults);
  };
  const results = { pricePerShare: model.pricePerShare, postMoneyValuation: model.postMoneyValuation, newInvestorPct: model.newInvestorPct, poolPostPct: model.poolPostPct, convertedShares: model.convertedShares, postFullyDiluted: model.postFullyDiluted };

  return (
    <div className="space-y-5">
      <ScenarioBar companyId={companyId} type="FINANCING" scenarios={scenarios} currentId={scenarioId} params={p} results={results} onLoad={load} onNew={reset} canEdit={canEdit} basePath={`/app/${companyId}/modeling`} />

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Round terms</CardTitle>
                <CardDescription>{lastRound ? `Last round: ${lastRound.name} at ${price(lastRound.pricePerShare)}` : "No priced round yet"}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Pre-money valuation" hint="Fully diluted, including pool top-up and conversions.">
                <Input type="number" prefix="$" step={500_000} min={0} value={p.preMoneyValuation || ""} onChange={(e) => set({ preMoneyValuation: Number(e.target.value) })} />
              </Field>
              <Field label="New share class">
                <Input value={p.newShareClassName} onChange={(e) => set({ newShareClassName: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Pool target (post)" hint="Blank = no top-up">
                  <Input type="number" suffix="%" min={0} max={50} step={0.5} value={p.targetPoolPct ?? ""} onChange={(e) => set({ targetPoolPct: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
                <Field label="Pool timing">
                  <Select value={p.poolTiming} onChange={(e) => set({ poolTiming: e.target.value as "PRE" | "POST" })}>
                    <option value="PRE">Pre-money</option>
                    <option value="POST">Post-money</option>
                  </Select>
                </Field>
              </div>
              <div className="space-y-2 border-t border-border pt-3">
                <label className="flex items-center justify-between text-[13px]">
                  <span>Convert SAFEs ({convertibles.filter((c) => c.type === "SAFE").length})</span>
                  <Switch checked={p.convertSafes} onCheckedChange={(v) => set({ convertSafes: v })} />
                </label>
                <label className="flex items-center justify-between text-[13px]">
                  <span>Convert notes ({convertibles.filter((c) => c.type !== "SAFE").length})</span>
                  <Switch checked={p.convertNotes} onCheckedChange={(v) => set({ convertNotes: v })} />
                </label>
                <label className="flex items-center justify-between text-[13px]">
                  <span>Apply MFN clauses</span>
                  <Switch checked={p.applyMfn} onCheckedChange={(v) => set({ applyMfn: v })} />
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>New money</CardTitle>
                <CardDescription>{money(totalRaise)} total</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => set({ investors: [...p.investors, { name: "", amount: 0, stakeholderId: null }] })}>
                <Plus /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {p.investors.map((inv, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input className="h-8 min-w-0 flex-1" placeholder="Investor" value={inv.name} onChange={(e) => set({ investors: p.investors.map((x, j) => (j === i ? { ...x, name: e.target.value, stakeholderId: null } : x)) })} />
                  <Input className="h-8 w-32 shrink-0 sm:w-36" type="number" prefix="$" min={0} step={100_000} aria-label="Amount" value={inv.amount || ""} onChange={(e) => set({ investors: p.investors.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)) })} />
                  <button className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-danger" onClick={() => set({ investors: p.investors.filter((_, j) => j !== i) })} aria-label="Remove investor">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <Select
                className="h-8"
                value=""
                onChange={(e) => {
                  const sh = stakeholders.find((s) => s.id === e.target.value);
                  if (sh) set({ investors: [...p.investors, { name: sh.name, amount: Math.round(sh.fdPct * totalRaise), stakeholderId: sh.id }] });
                }}
              >
                <option value="">Add existing holder pro-rata…</option>
                {stakeholders
                  .filter((s) => s.relationship === "INVESTOR" && !p.investors.some((i) => i.stakeholderId === s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {percent(s.fdPct, 1)}
                    </option>
                  ))}
              </Select>
              <p className="text-xs text-muted-foreground">Pro-rata fills each holder's amount as their fully diluted % × total raise.</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          {model.warnings.map((w) => (
            <Alert key={w} tone="warning">
              {w}
            </Alert>
          ))}
          {/* Five tiles: 2-up on phones (last one full width), 3 + 2 from sm, one row once there is room. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 2xl:grid-cols-5">
            <Stat className="sm:col-span-2 2xl:col-span-1" label="Price per share" value={price(model.pricePerShare)} hint={currentFmv ? `${(model.pricePerShare / currentFmv).toFixed(1)}× common FMV` : undefined} />
            <Stat className="sm:col-span-2 2xl:col-span-1" label="Post-money" value={compactMoney(model.postMoneyValuation)} hint={`${compactMoney(model.preMoneyValuation)} pre`} />
            <Stat className="sm:col-span-2 2xl:col-span-1" label="New shares" value={shares(model.newMoneyShares)} hint={`${shares(model.convertedShares)} from conversion`} />
            <Stat className="sm:col-span-3 2xl:col-span-1" label="New investors" value={percent(model.newInvestorPct, 1)} hint={`${shares(model.postFullyDiluted)} post FD`} />
            <Stat className="col-span-2 sm:col-span-3 2xl:col-span-1" label="Pool (post)" value={percent(model.poolPostPct, 1)} hint={`+${shares(model.poolIncrease)} shares`} />
          </div>

          <DataTable
            rows={holderRows}
            columns={columns}
            rowKey={(r) => r.key}
            defaultSort={{ key: "post", dir: "desc" }}
            dense
            className="max-sm:[&_td]:px-2 max-sm:[&_th]:px-2 max-sm:[&_td:first-child]:pl-4 max-sm:[&_th:first-child]:pl-4 max-sm:[&_td:last-child]:pr-4 max-sm:[&_th:last-child]:pr-4"
            footer={
              totalRow ? (
                <tr>
                  <td className="sticky left-0 z-[1] max-xl:shadow-[1px_0_0_var(--border)]">
                    Total
                    <span className="block text-[11px] font-normal tabular text-muted-foreground sm:hidden">{shares(totalRow.postShares)} sh</span>
                  </td>
                  <td className={cn("num", phoneHidden)}>{shares(totalRow.preShares)}</td>
                  <td className="num">{percent(totalRow.prePct)}</td>
                  <td className={cn("num", phoneHidden)}>
                    {totalRow.newShares ? shares(totalRow.newShares) : "—"}
                    {totalRow.investedThisRound ? <span className="block text-[11px] font-normal text-muted-foreground">{money(totalRow.investedThisRound)} invested</span> : null}
                  </td>
                  <td className={cn("num", phoneHidden)}>{shares(totalRow.postShares)}</td>
                  <td className="num">{percent(totalRow.postPct)}</td>
                  <td></td>
                </tr>
              ) : null
            }
          />

          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Before</CardTitle>
                  <CardDescription>Fully diluted today</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <OwnershipDonut data={before} height={170} />
                <LegendList data={before} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>After</CardTitle>
                  <CardDescription>Post-money fully diluted</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <OwnershipDonut data={after} height={170} />
                <LegendList data={after} />
              </CardContent>
            </Card>
          </div>

          {model.conversions.length ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Conversions</CardTitle>
                  <CardDescription>Each instrument converts at the lowest of cap price, discount price and round price.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0 [&_td:first-child]:pl-5 [&_th:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:last-child]:pr-5">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Instrument</th>
                      <th className="text-right">Amount</th>
                      <th>Method</th>
                      <th className="text-right">Cap price</th>
                      <th className="text-right" title="Discount price">
                        Disc. price
                      </th>
                      <th className="text-right" title="Conversion price">
                        Conv. price
                      </th>
                      <th className="text-right">Shares</th>
                      <th className="text-right" title="Effective discount to the round price">
                        Eff. discount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.conversions.map((c) => {
                      const src = convertibles.find((x) => x.id === c.id);
                      return (
                        <tr key={c.id}>
                          <td>
                            <div className="max-w-[11rem] truncate sm:max-w-none" title={src?.holderName}>
                              {src?.holderName}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground">{src?.certificateNumber}</div>
                          </td>
                          <td className="num">{money(c.amount)}</td>
                          <td>
                            <Badge variant={c.method === "CAP" ? "info" : c.method === "DISCOUNT" ? "purple" : "neutral"}>{c.method === "CAP" ? "Cap" : c.method === "DISCOUNT" ? "Discount" : "Round price"}</Badge>
                          </td>
                          <td className="num">{price(c.capPrice)}</td>
                          <td className="num">{price(c.discountPrice)}</td>
                          <td className="num font-medium">{price(c.conversionPrice)}</td>
                          <td className="num">{shares(c.shares)}</td>
                          <td className="num">{c.effectiveDiscountPct ? `${c.effectiveDiscountPct.toFixed(1)}%` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex-col gap-3 sm:flex-row sm:gap-4 [&>div:last-child]:w-full sm:[&>div:last-child]:w-56 sm:[&>div:last-child]:shrink-0">
              <div>
                <CardTitle>Dilution sensitivity</CardTitle>
                <CardDescription>Post-money ownership across valuations (rows) and raise sizes (columns)</CardDescription>
              </div>
              <Select className="h-8" aria-label="Holder" value={gridHolder} onChange={(e) => setGridHolder(e.target.value)}>
                {stakeholders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </CardHeader>
            <CardContent className="px-0 pb-0 [&_td:first-child]:pl-5 [&_th:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:last-child]:pr-5">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-[2] max-lg:shadow-[1px_0_0_var(--border)]">Pre-money \ Raise</th>
                    {grid[0]?.cells.map((c) => (
                      <th key={c.raise} className="text-right">
                        {compactMoney(c.raise)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row) => (
                    <tr key={row.preMoney}>
                      <td className="sticky left-0 z-[1] bg-card font-medium [tr:hover>&]:bg-[#fafbfc] max-lg:shadow-[1px_0_0_var(--border)]">{compactMoney(row.preMoney)}</td>
                      {row.cells.map((c) => {
                        const isBase = row.preMoney === Number(p.preMoneyValuation) && c.raise === totalRaise;
                        return (
                          <td key={c.raise} className={cn("num", isBase && "bg-accent-soft font-semibold")}>
                            {c.holderPct != null ? percent(c.holderPct, 1) : "—"}
                            <div className="text-[11px] font-normal text-muted-foreground">
                              {price(c.pricePerShare)} · inv {percent(c.newInvestorPct, 0)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
