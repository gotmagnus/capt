"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, Progress } from "@/components/ui/misc";
import { Alert } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { FormDialog } from "@/components/forms";
import { date, money, percent, price, shares } from "@/lib/format";
import { saveScenario } from "@/app/app/[companyId]/employees/actions";
import type { EmployeeRow } from "@/lib/people-data";

export function RefreshPlanner({ companyId, rows, fmv, fullyDiluted, refreshScheduleId, refreshScheduleName }: { companyId: string; rows: EmployeeRow[]; fmv: number | null; fullyDiluted?: number; refreshScheduleId: string; refreshScheduleName: string }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.filter((r) => r.refreshDue).map((r) => r.stakeholderId)));
  const [amounts, setAmounts] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((r) => [r.stakeholderId, r.suggestedRefresh])));
  const sorted = useMemo(() => rows.slice().sort((a, b) => Number(b.refreshDue) - Number(a.refreshDue) || (a.monthsToFullyVested ?? 999) - (b.monthsToFullyVested ?? 999)), [rows]);
  const chosen = sorted.filter((r) => selected.has(r.stakeholderId));
  const totalRefresh = chosen.reduce((a, r) => a + (amounts[r.stakeholderId] ?? 0), 0);
  const setAmount = (id: string, value: string) => setAmounts((a) => ({ ...a, [id]: Math.max(0, Number(value)) }));
  const grantHref = (id: string) => `/app/${companyId}/securities/new?stakeholderId=${id}&type=OPTION_ISO&quantity=${amounts[id] ?? 0}&vestingScheduleId=${refreshScheduleId}`;
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Refresh grants keep tenured employees motivated as their initial grant vests out. Employees are flagged when they are more than 75% vested or will be fully vested within 12 months. Suggested size is 25% of the original grant, rounded to the nearest 1,000 shares, on the “{refreshScheduleName}” schedule.
      </Alert>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground tabular">{chosen.length}</span> selected · <span className="font-medium text-foreground tabular">{shares(totalRefresh)}</span> shares
          {fullyDiluted ? ` · ${percent(totalRefresh / fullyDiluted)} of fully diluted` : ""}
          {fmv ? ` · ${money(Math.round(totalRefresh * fmv))} at FMV` : ""}
        </div>
        <FormDialog
          trigger={
            <Button size="sm" disabled={chosen.length === 0}>
              <Save /> Save as refresh scenario
            </Button>
          }
          title="Save refresh scenario"
          description="Stores the selected employees and refresh amounts so you can attach them to a board consent later."
          action={saveScenario}
          hidden={{ companyId, type: "REFRESH", params: JSON.stringify({ refreshes: chosen.map((r) => ({ stakeholderId: r.stakeholderId, name: r.name, quantity: amounts[r.stakeholderId] ?? 0, vestingScheduleId: refreshScheduleId })) }), results: JSON.stringify({ totalShares: totalRefresh, count: chosen.length }) }}
        >
          <Field label="Scenario name">
            <Input name="name" defaultValue={`Refresh cycle — ${new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}`} required />
          </Field>
          <Field label="Description">
            <Input name="description" placeholder="Optional" />
          </Field>
        </FormDialog>
      </div>
      {/* Phones/tablets: a card per employee keeps the refresh input and Grant action in reach (the table is 11 columns wide). */}
      <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {sorted.map((r) => {
          const isSelected = selected.has(r.stakeholderId);
          return (
            <li key={r.stakeholderId} className={cn("rounded-lg border bg-card p-3", isSelected ? "border-accent/50 bg-accent-soft/40" : "border-border")}>
              <label className="flex items-start gap-2.5">
                <input type="checkbox" checked={isSelected} onChange={() => toggle(r.stakeholderId)} className="mt-1.5 size-4 shrink-0 accent-blue-600" aria-label={`Select ${r.name}`} />
                <Avatar name={r.name} size="sm" className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{r.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.title ?? r.relationship}</span>
                </span>
                {r.refreshDue ? <Badge variant="purple">Due</Badge> : null}
              </label>
              <div className="mt-3 flex items-center gap-2">
                <Progress value={r.percentVested * 100} className="flex-1" tone={r.percentVested > 0.75 ? "warning" : "accent"} />
                <span className="text-xs tabular">{percent(r.percentVested, 0)} vested</span>
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Granted</dt>
                  <dd className="tabular">{date(r.originalGrantDate)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Fully vested</dt>
                  <dd className="tabular">{date(r.fullyVestedDate)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Avg strike</dt>
                  <dd className="tabular">{price(r.avgStrike)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Months left</dt>
                  <dd className="tabular">{r.monthsToFullyVested ?? "—"}</dd>
                </div>
              </dl>
              <div className="mt-3 flex items-end gap-2 border-t border-border pt-3">
                <label className="block min-w-0 flex-1">
                  <span className="mb-1 block text-xs text-muted-foreground">Refresh shares</span>
                  <Input type="number" inputMode="numeric" step={1000} min={0} value={amounts[r.stakeholderId] ?? 0} onChange={(e) => setAmount(r.stakeholderId, e.target.value)} className="text-right" />
                </label>
                <Button variant="secondary" asChild>
                  <Link href={grantHref(r.stakeholderId)}>
                    Grant <ArrowRight />
                  </Link>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card scrollbar-thin lg:block">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8"></th>
              <th>Employee</th>
              <th>Original grant</th>
              <th>Cliff</th>
              <th>Fully vested</th>
              <th className="text-right">Months left</th>
              <th>Vested</th>
              <th className="text-right">Avg strike</th>
              <th className="text-right">FMV</th>
              <th className="text-right">Refresh shares</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const inTheMoney = fmv != null && r.avgStrike != null && fmv > r.avgStrike;
              return (
                <tr key={r.stakeholderId} className={selected.has(r.stakeholderId) ? "bg-accent-soft/40" : undefined}>
                  <td>
                    <input type="checkbox" checked={selected.has(r.stakeholderId)} onChange={() => toggle(r.stakeholderId)} className="size-4 accent-blue-600" aria-label={`Select ${r.name}`} />
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={r.name} size="sm" />
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.title ?? r.relationship}</div>
                      </div>
                      {r.refreshDue ? <Badge variant="purple">Due</Badge> : null}
                    </div>
                  </td>
                  <td className="text-muted-foreground">{date(r.originalGrantDate)}</td>
                  <td className="text-muted-foreground">{date(r.cliffDate)}</td>
                  <td className="text-muted-foreground">{date(r.fullyVestedDate)}</td>
                  <td className="num">{r.monthsToFullyVested ?? "—"}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Progress value={r.percentVested * 100} className="w-20" tone={r.percentVested > 0.75 ? "warning" : "accent"} />
                      <span className="text-xs tabular">{percent(r.percentVested, 0)}</span>
                    </div>
                  </td>
                  <td className="num">{price(r.avgStrike)}</td>
                  <td className={`num ${inTheMoney ? "text-success" : ""}`}>{price(fmv)}</td>
                  <td className="num">
                    <Input type="number" step={1000} min={0} value={amounts[r.stakeholderId] ?? 0} onChange={(e) => setAmount(r.stakeholderId, e.target.value)} className="ml-auto h-8 w-28 text-right" aria-label={`Refresh shares for ${r.name}`} />
                  </td>
                  <td>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={grantHref(r.stakeholderId)}>
                        Grant <ArrowRight />
                      </Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
