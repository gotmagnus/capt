"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/page";
import { FormDialog } from "@/components/forms";
import { Field } from "@/components/ui/label";
import { compactMoney, money, percent, shares } from "@/lib/format";
import { saveScenario } from "@/app/app/[companyId]/employees/actions";
import { LegendList, OwnershipDonut } from "@/components/charts";

export const LEVELS: { level: string; label: string; equity: number; salary: number }[] = [
  { level: "L3", label: "L3 · Associate", equity: 15_000, salary: 120_000 },
  { level: "L4", label: "L4 · Mid-level", equity: 30_000, salary: 150_000 },
  { level: "L5", label: "L5 · Senior", equity: 50_000, salary: 185_000 },
  { level: "L6", label: "L6 · Staff / Lead", equity: 90_000, salary: 215_000 },
  { level: "L7", label: "L7 · Director / Head of", equity: 150_000, salary: 240_000 },
  { level: "L8", label: "L8 · VP", equity: 200_000, salary: 270_000 },
  { level: "EXEC", label: "Executive (C-level)", equity: 400_000, salary: 300_000 },
];

export interface HireRow {
  id: string;
  title: string;
  level: string;
  count: number;
  equity: number;
  salary: number;
}

interface ScenarioDto {
  id: string;
  name: string;
  description: string | null;
  params: Record<string, unknown>;
  updatedAt: string;
}

function rowsFromParams(params: Record<string, unknown>): HireRow[] {
  const hires = (params.hires as Partial<HireRow>[] | undefined) ?? [];
  return hires.map((h, i) => ({
    id: `${Date.now()}-${i}`,
    title: h.title ?? "New hire",
    level: h.level ?? guessLevel(h.equity ?? 0),
    count: Number(h.count ?? 1),
    equity: Number(h.equity ?? 0),
    salary: Number(h.salary ?? LEVELS.find((l) => l.level === (h.level ?? guessLevel(h.equity ?? 0)))?.salary ?? 0),
  }));
}
function guessLevel(equity: number) {
  let best = LEVELS[0];
  for (const l of LEVELS) if (Math.abs(l.equity - equity) < Math.abs(best.equity - equity)) best = l;
  return best.level;
}

export function HiringPlanner({
  companyId,
  scenarios,
  fullyDiluted,
  poolAvailable,
  groups,
  fmv,
}: {
  companyId: string;
  scenarios: ScenarioDto[];
  fullyDiluted: number;
  poolAvailable: number;
  groups: { founders: number; investors: number; employees: number; advisors: number; other: number };
  fmv: number | null;
}) {
  const initial = scenarios[0];
  const [loadedId, setLoadedId] = useState<string>(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "New hiring plan");
  const [rows, setRows] = useState<HireRow[]>(initial ? rowsFromParams(initial.params) : [{ id: "1", title: "Senior Engineer", level: "L5", count: 2, equity: 50_000, salary: 185_000 }]);

  const totals = useMemo(() => {
    const sharesNeeded = rows.reduce((a, r) => a + r.count * r.equity, 0);
    const headcount = rows.reduce((a, r) => a + r.count, 0);
    const payroll = rows.reduce((a, r) => a + r.count * r.salary, 0);
    const shortfall = Math.max(0, sharesNeeded - poolAvailable);
    const postFd = fullyDiluted + shortfall;
    const employeesPost = groups.employees + sharesNeeded;
    const poolPost = Math.max(0, poolAvailable - sharesNeeded);
    return { sharesNeeded, headcount, payroll, shortfall, postFd, employeesPost, poolPost, pctOfFd: fullyDiluted ? sharesNeeded / fullyDiluted : 0 };
  }, [rows, poolAvailable, fullyDiluted, groups.employees]);

  const ownership = [
    { name: "Founders", value: groups.founders },
    { name: "Investors", value: groups.investors },
    { name: "Employees (incl. new hires)", value: totals.employeesPost },
    { name: "Advisors & other", value: groups.advisors + groups.other },
    { name: "Remaining pool", value: totals.poolPost },
  ];

  const update = (id: string, patch: Partial<HireRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const setLevel = (id: string, level: string) => {
    const l = LEVELS.find((x) => x.level === level);
    if (l) update(id, { level: l.level, equity: l.equity, salary: l.salary });
  };
  const load = (id: string) => {
    const sc = scenarios.find((s) => s.id === id);
    setLoadedId(id);
    if (!sc) return;
    setName(sc.name);
    setRows(rowsFromParams(sc.params));
    toast.message(`Loaded “${sc.name}”`);
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-col sm:flex-row">
          <div className="min-w-0">
            <CardTitle>Hiring plan</CardTitle>
            <CardDescription>Size the option pool against your next hires. Level presets follow common Series A equity bands.</CardDescription>
          </div>
          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
            <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
              <Select value={loadedId} onChange={(e) => load(e.target.value)} className="h-8 text-xs" aria-label="Saved plan">
                <option value="">Load saved plan…</option>
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <FormDialog
              trigger={
                <Button size="sm" className="shrink-0">
                  <Save /> Save plan
                </Button>
              }
              title="Save hiring plan"
              action={saveScenario}
              hidden={{ companyId, id: loadedId || undefined, type: "HIRING", params: JSON.stringify({ hires: rows.map(({ title, level, count, equity, salary }) => ({ title, level, count, equity, salary })) }), results: JSON.stringify(totals) }}
              submitLabel={loadedId ? "Update plan" : "Save plan"}
              onSuccess={(r) => r.data && setLoadedId(r.data.id)}
            >
              <Field label="Plan name">
                <Input name="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field label="Description">
                <Input name="description" placeholder="e.g. FY2027 plan assuming Series B closes in Q1" defaultValue={scenarios.find((s) => s.id === loadedId)?.description ?? ""} />
              </Field>
            </FormDialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Below xl: one editable block per role — the 8-column table of inputs needs ~900px. */}
          <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
            {rows.map((r) => (
              <div key={r.id} className="space-y-2.5 rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <Input value={r.title} onChange={(e) => update(r.id, { title: e.target.value })} className="h-9" aria-label="Role" />
                  <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => removeRow(r.id)} aria-label={`Remove ${r.title}`}>
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs text-muted-foreground">Level</span>
                    <Select value={r.level} onChange={(e) => setLevel(r.id, e.target.value)} className="h-9">
                      {LEVELS.map((l) => (
                        <option key={l.level} value={l.level}>
                          {l.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">Count</span>
                    <Input type="number" inputMode="numeric" min={0} value={r.count} onChange={(e) => update(r.id, { count: Math.max(0, Number(e.target.value)) })} className="h-9 text-right" />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">Equity / hire</span>
                    <Input type="number" inputMode="numeric" min={0} step={1000} value={r.equity} onChange={(e) => update(r.id, { equity: Math.max(0, Number(e.target.value)) })} className="h-9 text-right" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">Salary</span>
                    <Input type="number" inputMode="numeric" min={0} step={5000} value={r.salary} onChange={(e) => update(r.id, { salary: Math.max(0, Number(e.target.value)) })} className="h-9 text-right" />
                  </label>
                </div>
                <div className="flex items-baseline justify-between border-t border-border pt-2 text-[13px]">
                  <span className="text-xs text-muted-foreground">Total shares</span>
                  <span className="tabular">
                    <span className="font-medium">{shares(r.count * r.equity)}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">{percent(fullyDiluted ? (r.count * r.equity) / fullyDiluted : 0)} FD</span>
                  </span>
                </div>
              </div>
            ))}
            {rows.length ? (
              <dl className="grid grid-cols-3 gap-2 rounded-md bg-muted px-3 py-2.5 text-[13px] sm:col-span-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Hires</dt>
                  <dd className="font-semibold tabular">{totals.headcount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Payroll</dt>
                  <dd className="font-semibold tabular">{compactMoney(totals.payroll)}</dd>
                </div>
                <div className="text-right">
                  <dt className="text-xs text-muted-foreground">Shares · % FD</dt>
                  <dd className="font-semibold tabular">
                    {shares(totals.sharesNeeded)} <span className="text-xs font-normal text-muted-foreground">{percent(totals.pctOfFd)}</span>
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="rounded-md border border-dashed border-border-strong px-3 py-6 text-center text-[13px] text-muted-foreground sm:col-span-2">No roles yet. Add the first hire below.</p>
            )}
          </div>

          <div className="hidden overflow-x-auto rounded-md border border-border scrollbar-thin xl:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Level</th>
                  <th className="text-right">Count</th>
                  <th className="text-right">Equity / hire</th>
                  <th className="text-right">Salary</th>
                  <th className="text-right">Total shares</th>
                  <th className="text-right">% FD</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="w-[30%]">
                      <Input value={r.title} onChange={(e) => update(r.id, { title: e.target.value })} className="h-8 min-w-36" aria-label="Role" />
                    </td>
                    <td>
                      {/* Select renders its own relative wrapper (chevron anchor) — size the wrapper, not the control. */}
                      <div className="w-44">
                        <Select value={r.level} onChange={(e) => setLevel(r.id, e.target.value)} className="h-8 text-xs" aria-label="Level">
                          {LEVELS.map((l) => (
                            <option key={l.level} value={l.level}>
                              {l.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </td>
                    <td className="num">
                      <Input type="number" min={0} value={r.count} onChange={(e) => update(r.id, { count: Math.max(0, Number(e.target.value)) })} className="ml-auto h-8 w-16 text-right" aria-label="Count" />
                    </td>
                    <td className="num">
                      <Input type="number" min={0} step={1000} value={r.equity} onChange={(e) => update(r.id, { equity: Math.max(0, Number(e.target.value)) })} className="ml-auto h-8 w-28 text-right" aria-label="Equity per hire" />
                    </td>
                    <td className="num">
                      <Input type="number" min={0} step={5000} value={r.salary} onChange={(e) => update(r.id, { salary: Math.max(0, Number(e.target.value)) })} className="ml-auto h-8 w-28 text-right" aria-label="Salary" />
                    </td>
                    <td className="num font-medium">{shares(r.count * r.equity)}</td>
                    <td className="num text-muted-foreground">{percent(fullyDiluted ? (r.count * r.equity) / fullyDiluted : 0)}</td>
                    <td>
                      <Button variant="ghost" size="icon-sm" onClick={() => removeRow(r.id)} aria-label={`Remove ${r.title}`}>
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="num">{totals.headcount}</td>
                  <td></td>
                  <td className="num">{money(totals.payroll)}</td>
                  <td className="num">{shares(totals.sharesNeeded)}</td>
                  <td className="num">{percent(totals.pctOfFd)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setRows((rs) => [...rs, { id: `${Date.now()}`, title: "New hire", level: "L4", count: 1, equity: 30_000, salary: 150_000 }])}>
            <Plus /> Add role
          </Button>
        </CardContent>
      </Card>

      <div className="grid items-start gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pool impact</CardTitle>
              <CardDescription>Unallocated pool today: {shares(poolAvailable)}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <div className="text-xs text-muted-foreground">Shares needed</div>
                <div className="font-semibold tabular">{shares(totals.sharesNeeded)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Value at FMV</div>
                <div className="font-semibold tabular">{fmv ? money(totals.sharesNeeded * fmv) : "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Pool after hires</div>
                <div className={`font-semibold tabular ${totals.shortfall > 0 ? "text-danger" : "text-success"}`}>{totals.shortfall > 0 ? `−${shares(totals.shortfall)}` : shares(totals.poolPost)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Coverage</div>
                <div className="font-semibold tabular">{totals.sharesNeeded ? percent(Math.min(1, poolAvailable / totals.sharesNeeded), 0) : "—"}</div>
              </div>
            </div>
            {totals.shortfall > 0 ? (
              <Alert tone="warning" icon={AlertTriangle} title={`Pool short by ${shares(totals.shortfall)} shares`}>
                Increase the plan reserve by at least {shares(Math.ceil(totals.shortfall / 50_000) * 50_000)} shares ({percent(totals.shortfall / totals.postFd, 2)} dilution to all holders) or reduce grant sizes.
              </Alert>
            ) : (
              <Alert tone="success">The current pool covers this plan with {shares(totals.poolPost)} shares to spare.</Alert>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Ownership after hiring</CardTitle>
              <CardDescription>Fully diluted, assuming any shortfall is added to the pool</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <OwnershipDonut data={ownership} height={170} />
            <LegendList data={ownership} total={totals.postFd} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
