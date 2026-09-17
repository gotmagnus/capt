"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Scissors } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/forms";
import { money, shares } from "@/lib/format";
import { cn } from "@/lib/utils";
import { splitIsoExcess } from "../actions";

interface Row {
  stakeholderId: string;
  stakeholderName: string;
  totalExcessShares: number;
  hasExcess: boolean;
  years: { year: number; firstExercisableValue: number; isoQualified: number; excessShares: number; grants: { securityId: string; certificateNumber: string; shares: number; value: number; excessShares: number; alreadySplit: boolean }[] }[];
}

export function IsoLimitTable({ companyId, rows, canEdit }: { companyId: string; rows: Row[]; canEdit: boolean }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(rows.filter((r) => r.hasExcess).map((r) => r.stakeholderId)));
  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card scrollbar-thin">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-8 max-sm:pr-0" />
            <th>Holder / year</th>
            <th className="text-right max-sm:hidden">First-exercisable value</th>
            <th className="text-right max-sm:hidden">ISO qualified</th>
            <th className="text-right max-sm:hidden">Excess (NSO)</th>
            <th>Status</th>
            <th className="text-right max-sm:hidden">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = open.has(r.stakeholderId);
            return (
              <HolderRows key={r.stakeholderId} r={r} isOpen={isOpen} toggle={() => toggle(r.stakeholderId)} companyId={companyId} canEdit={canEdit} />
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center text-muted-foreground">
                No ISO grants outstanding.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function HolderRows({ r, isOpen, toggle, companyId, canEdit }: { r: Row; isOpen: boolean; toggle: () => void; companyId: string; canEdit: boolean }) {
  const totalValue = r.years.reduce((a, y) => a + y.firstExercisableValue, 0);
  const totalQualified = r.years.reduce((a, y) => a + y.isoQualified, 0);
  return (
    <>
      <tr className={cn("cursor-pointer", r.hasExcess && "bg-warning-soft/40")} onClick={toggle}>
        <td className="max-sm:pr-0">{isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}</td>
        <td>
          <Link href={`/app/${companyId}/stakeholders/${r.stakeholderId}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.stakeholderName}
          </Link>
          <span className="ml-2 text-xs text-muted-foreground">{r.years.length} year{r.years.length === 1 ? "" : "s"}</span>
          {/* Phones: the numeric columns fold under the holder. */}
          <div className="text-xs tabular text-muted-foreground sm:hidden">
            {money(totalValue)} first-exercisable{r.totalExcessShares > 0 ? <span className="font-medium text-warning"> · {shares(r.totalExcessShares)} excess</span> : null}
          </div>
        </td>
        <td className="num max-sm:hidden">{money(totalValue)}</td>
        <td className="num max-sm:hidden">{shares(totalQualified)}</td>
        <td className={cn("num max-sm:hidden", r.totalExcessShares > 0 && "font-semibold text-warning")}>{shares(r.totalExcessShares)}</td>
        <td>{r.hasExcess ? <Badge variant="warning">Over limit</Badge> : <Badge variant="success">OK</Badge>}</td>
        <td className="max-sm:hidden" />
      </tr>
      {isOpen
        ? r.years.map((y) => {
            const splittable = y.excessShares > 0 && y.grants.some((g) => g.excessShares > 0 && !g.alreadySplit);
            const split =
              canEdit && splittable ? (
                <ConfirmButton action={splitIsoExcess} hidden={{ companyId, stakeholderId: r.stakeholderId, year: y.year }} title={`Split ${shares(y.excessShares)} excess shares to NSO?`} description="Reduces the ISO grant(s) by the excess and creates matching NSO grants with the same terms, recorded as a modification." confirmLabel="Split" size="xs" variant="secondary" successMessage="Excess reclassified">
                  <Scissors /> Split excess to NSO
                </ConfirmButton>
              ) : null;
            return (
              <tr key={y.year} className="bg-muted/30">
                <td className="max-sm:pr-0" />
                <td className="max-sm:whitespace-normal sm:pl-6">
                  <div className="text-xs font-semibold">
                    {y.year}
                    <span className="ml-2 font-normal tabular text-muted-foreground sm:hidden">
                      {money(y.firstExercisableValue)} · {shares(y.isoQualified)} ISO
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {y.grants.map((g) => (
                      <li key={g.securityId}>
                        <Link href={`/app/${companyId}/securities/${g.securityId}`} className="font-mono hover:underline">
                          {g.certificateNumber}
                        </Link>{" "}
                        · {shares(g.shares)} vest ({money(g.value)}){g.excessShares > 0 ? ` · ${shares(g.excessShares)} excess${g.alreadySplit ? " (split)" : ""}` : ""}
                      </li>
                    ))}
                  </ul>
                  {split ? <div className="mt-2 sm:hidden">{split}</div> : null}
                </td>
                <td className="num align-top max-sm:hidden">{money(y.firstExercisableValue)}</td>
                <td className="num align-top max-sm:hidden">{shares(y.isoQualified)}</td>
                <td className={cn("num align-top max-sm:hidden", y.excessShares > 0 && "font-semibold text-warning")}>{shares(y.excessShares)}</td>
                <td className="align-top">{y.excessShares > 0 ? <Badge variant="warning">{y.firstExercisableValue > 100_000 ? `${money(y.firstExercisableValue - 100_000)} over` : `${shares(y.excessShares)} excess`}</Badge> : <Badge variant="neutral">Within limit</Badge>}</td>
                <td className="text-right align-top max-sm:hidden">{split}</td>
              </tr>
            );
          })
        : null}
    </>
  );
}
