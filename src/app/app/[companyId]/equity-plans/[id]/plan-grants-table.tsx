"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar, Progress } from "@/components/ui/misc";
import { date, percent, price, shares } from "@/lib/format";
import { SECURITY_TYPE_LABELS, type SecurityType } from "@/lib/types";

export interface PlanGrantRow {
  id: string;
  certificateNumber: string;
  stakeholderId: string;
  holderName: string;
  type: string;
  quantity: number;
  remaining: number;
  strike: number | null;
  grantDate: string;
  vestedPct: number | null;
  status: string;
}

export function PlanGrantsTable({ companyId, rows }: { companyId: string; rows: PlanGrantRow[] }) {
  const columns: Column<PlanGrantRow>[] = [
    {
      key: "holder",
      header: "Holder",
      cell: (r) => (
        <Link href={`/app/${companyId}/stakeholders/${r.stakeholderId}`} className="flex items-center gap-2 hover:underline">
          <Avatar name={r.holderName} size="xs" /> {r.holderName}
        </Link>
      ),
      sortValue: (r) => r.holderName,
    },
    {
      key: "cert",
      header: "Grant",
      cell: (r) => (
        <Link href={`/app/${companyId}/securities/${r.id}`} className="font-mono text-xs hover:underline">
          {r.certificateNumber}
        </Link>
      ),
      sortValue: (r) => r.certificateNumber,
    },
    { key: "type", header: "Type", cell: (r) => <Badge variant="outline">{SECURITY_TYPE_LABELS[r.type as SecurityType] ?? r.type}</Badge>, sortValue: (r) => r.type },
    { key: "quantity", header: "Granted", align: "right", cell: (r) => shares(r.quantity), sortValue: (r) => r.quantity },
    { key: "remaining", header: "Outstanding", align: "right", cell: (r) => <span className="text-muted-foreground">{shares(r.remaining)}</span>, sortValue: (r) => r.remaining },
    { key: "strike", header: "Strike", align: "right", cell: (r) => <span className="text-muted-foreground">{r.strike != null ? price(r.strike) : "—"}</span>, sortValue: (r) => r.strike ?? -1 },
    { key: "grantDate", header: "Grant date", cell: (r) => <span className="text-muted-foreground">{date(r.grantDate)}</span>, sortValue: (r) => r.grantDate },
    {
      key: "vested",
      header: "Vested",
      cell: (r) =>
        r.vestedPct == null ? (
          "—"
        ) : (
          <div className="flex items-center gap-2 min-w-[110px]">
            <Progress value={r.vestedPct * 100} className="w-14" tone={r.vestedPct >= 1 ? "success" : "accent"} />
            <span className="text-xs tabular text-muted-foreground">{percent(r.vestedPct, 0)}</span>
          </div>
        ),
      sortValue: (r) => r.vestedPct ?? -1,
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} />, sortValue: (r) => r.status },
  ];
  return <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} searchable={(r) => `${r.holderName} ${r.certificateNumber}`} searchPlaceholder="Search grants…" defaultSort={{ key: "grantDate", dir: "desc" }} rowHref={(r) => `/app/${companyId}/securities/${r.id}`} emptyTitle="No awards granted from this plan yet" />;
}
