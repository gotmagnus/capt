"use client";

import { useState } from "react";
import Link from "next/link";
import { DataTable, FilterSelect, type Column } from "@/components/data-table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { date, relative } from "@/lib/format";
import { CONSENT_TYPE_LABELS, STATUS_LABELS, type ConsentType } from "@/lib/types";
import { cn } from "@/lib/utils";

const phoneHidden = "max-sm:hidden";

export interface ConsentRow {
  id: string;
  title: string;
  type: string;
  status: string;
  effectiveDate: string | null;
  sentAt: string | null;
  approvedAt: string | null;
  signed: number;
  total: number;
  required: number;
  exhibits: number;
  createdAt: string;
}

export function BoardTable({ companyId, rows }: { companyId: string; rows: ConsentRow[] }) {
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const filtered = rows.filter((r) => (!status || r.status === status) && (!type || r.type === type));
  const columns: Column<ConsentRow>[] = [
    {
      key: "title",
      header: "Consent",
      sortValue: (r) => r.title,
      cell: (r) => (
        <div className="min-w-0 max-sm:whitespace-normal">
          <Link href={`/app/${companyId}/board/${r.id}`} className="font-medium hover:underline">
            {r.title}
          </Link>
          <div className="text-xs text-muted-foreground">
            {r.exhibits} exhibit{r.exhibits === 1 ? "" : "s"} · created {relative(r.createdAt)}
          </div>
          {/* Phones show one column: status, type and signature count fold under the title. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
            <StatusBadge status={r.status} />
            <Badge variant="outline">{CONSENT_TYPE_LABELS[r.type as ConsentType] ?? r.type}</Badge>
            <span className="tabular text-xs text-muted-foreground">
              {r.signed}/{r.total} signed
            </span>
          </div>
        </div>
      ),
    },
    { key: "type", header: "Type", className: phoneHidden, sortValue: (r) => r.type, cell: (r) => <Badge variant="outline">{CONSENT_TYPE_LABELS[r.type as ConsentType] ?? r.type}</Badge> },
    { key: "status", header: "Status", className: phoneHidden, sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "signatures",
      header: "Signatures",
      className: phoneHidden,
      sortValue: (r) => (r.total ? r.signed / r.total : 0),
      cell: (r) => (
        <div className="flex w-40 items-center gap-2">
          <Progress value={r.total ? (r.signed / r.total) * 100 : 0} tone={r.status === "APPROVED" ? "success" : "accent"} className={cn("flex-1", !r.signed && "[&>*]:opacity-0")} />
          <span className="tabular text-xs text-muted-foreground">
            {r.signed}/{r.total}
            {r.required && r.required < r.total ? ` (${r.required} req.)` : ""}
          </span>
        </div>
      ),
    },
    { key: "effectiveDate", header: "Effective", className: phoneHidden, sortValue: (r) => r.effectiveDate ?? "", cell: (r) => <span className="text-muted-foreground">{date(r.effectiveDate)}</span> },
    { key: "sentAt", header: "Sent", className: phoneHidden, sortValue: (r) => r.sentAt ?? "", cell: (r) => <span className="text-muted-foreground">{date(r.sentAt)}</span> },
    { key: "approvedAt", header: "Approved", className: phoneHidden, sortValue: (r) => r.approvedAt ?? "", cell: (r) => <span className="text-muted-foreground">{date(r.approvedAt)}</span> },
  ];
  return (
    <DataTable
      rows={filtered}
      columns={columns}
      rowKey={(r) => r.id}
      rowHref={(r) => `/app/${companyId}/board/${r.id}`}
      searchable={(r) => `${r.title} ${r.type} ${r.status}`}
      searchPlaceholder="Search consents…"
      defaultSort={{ key: "sentAt", dir: "desc" }}
      emptyTitle="No board consents"
      emptyDescription="Create a consent to approve option grants, valuations, plans or financings."
      filters={
        <>
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={["DRAFT", "SENT", "APPROVED", "REJECTED", "WITHDRAWN"].map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s.charAt(0) + s.slice(1).toLowerCase() }))}
          />
          <FilterSelect label="Type" value={type} onChange={setType} options={Object.entries(CONSENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
        </>
      }
    />
  );
}
