"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, FilterSelect } from "@/components/data-table";
import { Avatar } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { date, money, price, shares } from "@/lib/format";
import { SECURITY_TYPE_LABELS, STATUS_LABELS, type SecurityType } from "@/lib/types";
import { exerciseMethodLabel } from "@/components/people-labels";

export interface ExerciseRow {
  id: string;
  holder: string;
  stakeholderId: string;
  securityId: string;
  certificateNumber: string;
  type: string;
  quantity: number;
  exercisePrice: number;
  totalCost: number;
  fmv: number | null;
  method: string;
  status: string;
  requestedAt: string;
  completedAt: string | null;
}

const STATUSES = ["REQUESTED", "APPROVED", "PAYMENT_PENDING", "PAID", "COMPLETED", "REJECTED", "CANCELLED"];

export function ExercisesTable({ companyId, rows }: { companyId: string; rows: ExerciseRow[] }) {
  const [status, setStatus] = useState("");
  const filtered = useMemo(() => (status === "OPEN" ? rows.filter((r) => ["REQUESTED", "APPROVED", "PAYMENT_PENDING", "PAID"].includes(r.status)) : status ? rows.filter((r) => r.status === status) : rows), [rows, status]);
  return (
    <DataTable
      rows={filtered}
      rowKey={(r) => r.id}
      rowHref={(r) => `/app/${companyId}/exercises/${r.id}`}
      searchable={(r) => `${r.holder} ${r.certificateNumber}`}
      searchPlaceholder="Search by holder or grant…"
      defaultSort={{ key: "requested", dir: "desc" }}
      emptyTitle="No exercise requests"
      emptyDescription="Requests appear here when holders exercise from their portal or when you record one."
      filters={<FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: "OPEN", label: "In progress" }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))]} />}
      columns={[
        {
          key: "holder",
          header: "Holder",
          sortValue: (r) => r.holder,
          cell: (r) => (
            <span className="flex items-center gap-2">
              <Avatar name={r.holder} size="sm" />
              <span className="font-medium">{r.holder}</span>
              {/* Phones: status lives several columns to the right — surface it next to the name. */}
              <StatusBadge status={r.status} className="sm:hidden" />
            </span>
          ),
        },
        {
          key: "grant",
          header: "Grant",
          sortValue: (r) => r.certificateNumber,
          cell: (r) => (
            <Link href={`/app/${companyId}/securities/${r.securityId}`} className="font-mono text-xs hover:underline">
              {r.certificateNumber}
            </Link>
          ),
        },
        { key: "type", header: "Type", sortValue: (r) => r.type, cell: (r) => <Badge variant="outline">{SECURITY_TYPE_LABELS[r.type as SecurityType] ?? r.type}</Badge> },
        { key: "qty", header: "Quantity", align: "right", sortValue: (r) => r.quantity, cell: (r) => shares(r.quantity) },
        { key: "strike", header: "Exercise price", align: "right", sortValue: (r) => r.exercisePrice, cell: (r) => price(r.exercisePrice) },
        { key: "cost", header: "Total cost", align: "right", sortValue: (r) => r.totalCost, cell: (r) => money(r.totalCost, { cents: true }) },
        { key: "fmv", header: "FMV", align: "right", sortValue: (r) => r.fmv ?? 0, cell: (r) => price(r.fmv) },
        { key: "spread", header: "Spread", align: "right", sortValue: (r) => (r.fmv ? (r.fmv - r.exercisePrice) * r.quantity : 0), cell: (r) => (r.fmv ? <span className={r.fmv > r.exercisePrice ? "text-success" : ""}>{money((r.fmv - r.exercisePrice) * r.quantity)}</span> : "—") },
        { key: "method", header: "Method", sortValue: (r) => r.method, cell: (r) => <span className="text-muted-foreground">{exerciseMethodLabel(r.method)}</span> },
        { key: "requested", header: "Requested", sortValue: (r) => r.requestedAt, cell: (r) => <span className="text-muted-foreground">{date(r.requestedAt)}</span> },
        { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
