"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { money, number, price, shares } from "@/lib/format";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";

const phoneHidden = "max-sm:hidden";

export interface GrantRow {
  grantId: string;
  stakeholderId: string;
  stakeholderName: string;
  department: string | null;
  type: string;
  quantity: number;
  fairValuePerShare: number;
  totalFairValue: number;
  periodExpense: number;
  recognizedToDate: number;
  unrecognized: number;
  forfeited: number;
  remainingMonths: number;
  expectedTerm: number;
}

export function Asc718GrantTable({ companyId, rows }: { companyId: string; rows: GrantRow[] }) {
  const columns: Column<GrantRow>[] = [
    {
      key: "holder",
      header: "Holder",
      sortValue: (r) => r.stakeholderName,
      cell: (r) => (
        <div className="max-sm:max-w-[9.5rem] max-sm:[&>*]:truncate">
          <Link href={`/app/${companyId}/stakeholders/${r.stakeholderId}`} className="block font-medium hover:underline">
            {r.stakeholderName}
          </Link>
          <div className="text-xs text-muted-foreground">{r.department ?? "Unassigned"}</div>
          {/* Phones keep holder, period expense and unrecognized cost; the rest folds in here. */}
          <div className="text-xs tabular text-muted-foreground sm:hidden">
            {SECURITY_TYPE_LABELS[r.type as SecurityType] ?? r.type} · {shares(r.quantity)} sh
          </div>
        </div>
      ),
    },
    { key: "type", className: phoneHidden, header: "Type", sortValue: (r) => r.type, cell: (r) => <Badge variant="outline">{SECURITY_TYPE_LABELS[r.type as SecurityType] ?? r.type}</Badge> },
    { key: "qty", className: phoneHidden, header: "Shares", align: "right", sortValue: (r) => r.quantity, cell: (r) => shares(r.quantity) },
    { key: "fv", className: phoneHidden, header: "FV / share", align: "right", sortValue: (r) => r.fairValuePerShare, cell: (r) => price(r.fairValuePerShare) },
    { key: "term", className: phoneHidden, header: "Exp. term", align: "right", sortValue: (r) => r.expectedTerm, cell: (r) => (r.expectedTerm ? `${number(r.expectedTerm)}y` : "—") },
    { key: "total", className: phoneHidden, header: "Total FV", align: "right", sortValue: (r) => r.totalFairValue, cell: (r) => money(r.totalFairValue) },
    { key: "period", header: <><span className="sm:hidden">Period</span><span className="max-sm:hidden">Period expense</span></>, align: "right", sortValue: (r) => r.periodExpense, cell: (r) => <span className="font-medium">{money(r.periodExpense)}</span> },
    { key: "rec", className: phoneHidden, header: "Recognized", align: "right", sortValue: (r) => r.recognizedToDate, cell: (r) => money(r.recognizedToDate) },
    { key: "unrec", header: <><span className="sm:hidden">Unrecog.</span><span className="max-sm:hidden">Unrecognized</span></>, align: "right", sortValue: (r) => r.unrecognized, cell: (r) => money(r.unrecognized) },
    { key: "forf", className: phoneHidden, header: "Forfeited", align: "right", sortValue: (r) => r.forfeited, cell: (r) => (r.forfeited ? <span className="text-danger">{money(r.forfeited)}</span> : "—") },
    { key: "rem", className: phoneHidden, header: "Months left", align: "right", sortValue: (r) => r.remainingMonths, cell: (r) => r.remainingMonths },
  ];
  const totals = rows.reduce(
    (t, r) => ({ total: t.total + r.totalFairValue, period: t.period + r.periodExpense, rec: t.rec + r.recognizedToDate, unrec: t.unrec + r.unrecognized, forf: t.forf + r.forfeited }),
    { total: 0, period: 0, rec: 0, unrec: 0, forf: 0 },
  );
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.grantId}
      rowHref={(r) => `/app/${companyId}/securities/${r.grantId}`}
      searchable={(r) => `${r.stakeholderName} ${r.department ?? ""} ${r.type}`}
      defaultSort={{ key: "period", dir: "desc" }}
      emptyTitle="No awards in scope"
      className="max-sm:[&_td]:px-2.5 max-sm:[&_th]:px-2.5 max-sm:[&_td:first-child]:pl-3 max-sm:[&_th:first-child]:pl-3"
      footer={
        <tr>
          <td>Total ({rows.length} grants)</td>
          <td colSpan={4} className={phoneHidden} />
          <td className={`num ${phoneHidden}`}>{money(totals.total)}</td>
          <td className="num">{money(totals.period)}</td>
          <td className={`num ${phoneHidden}`}>{money(totals.rec)}</td>
          <td className="num">{money(totals.unrec)}</td>
          <td className={`num ${phoneHidden}`}>{totals.forf ? money(totals.forf) : "—"}</td>
          <td className={phoneHidden} />
        </tr>
      }
    />
  );
}
