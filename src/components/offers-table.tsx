"use client";

import { useMemo, useState } from "react";
import { DataTable, FilterSelect } from "@/components/data-table";
import { Avatar } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { date, money, price, shares } from "@/lib/format";
import { SECURITY_TYPE_LABELS, STATUS_LABELS, type SecurityType } from "@/lib/types";

export interface OfferRow {
  id: string;
  candidateName: string;
  candidateEmail: string;
  title: string;
  department: string | null;
  level: string | null;
  salary: number | null;
  equityQuantity: number;
  equityType: string;
  strikePrice: number | null;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
}

export function OffersTable({ companyId, rows }: { companyId: string; rows: OfferRow[] }) {
  const [status, setStatus] = useState("");
  const filtered = useMemo(() => (status === "OPEN" ? rows.filter((r) => ["SENT", "VIEWED"].includes(r.status)) : status ? rows.filter((r) => r.status === status) : rows), [rows, status]);
  return (
    <DataTable
      rows={filtered}
      rowKey={(r) => r.id}
      rowHref={(r) => `/app/${companyId}/offers/${r.id}`}
      searchable={(r) => `${r.candidateName} ${r.candidateEmail} ${r.title}`}
      searchPlaceholder="Search candidates…"
      defaultSort={{ key: "sent", dir: "desc" }}
      emptyTitle="No offer letters yet"
      emptyDescription="Create an interactive offer that shows candidates what their equity could be worth."
      filters={<FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: "OPEN", label: "Outstanding" }, ...["DRAFT", "SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED"].map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))]} />}
      columns={[
        {
          key: "candidate",
          header: "Candidate",
          sortValue: (r) => r.candidateName,
          cell: (r) => (
            <span className="flex items-center gap-2">
              <Avatar name={r.candidateName} size="sm" />
              <span>
                <span className="flex items-center gap-2 font-medium">
                  {r.candidateName}
                  {/* Phones: status lives several columns to the right — surface it next to the name. */}
                  <StatusBadge status={r.status} className="sm:hidden" />
                </span>
                <span className="block text-xs text-muted-foreground">{r.candidateEmail}</span>
              </span>
            </span>
          ),
        },
        { key: "title", header: "Role", sortValue: (r) => r.title, cell: (r) => <span>{r.title}{r.department ? <span className="text-muted-foreground"> · {r.department}</span> : null}</span> },
        { key: "level", header: "Level", sortValue: (r) => r.level ?? "", cell: (r) => (r.level ? <Badge variant="outline">{r.level}</Badge> : "—") },
        { key: "salary", header: "Salary", align: "right", sortValue: (r) => r.salary ?? 0, cell: (r) => money(r.salary) },
        { key: "equity", header: "Equity", align: "right", sortValue: (r) => r.equityQuantity, cell: (r) => <span>{shares(r.equityQuantity)} <span className="text-xs text-muted-foreground">{SECURITY_TYPE_LABELS[r.equityType as SecurityType]}</span></span> },
        { key: "strike", header: "Strike", align: "right", sortValue: (r) => r.strikePrice ?? 0, cell: (r) => price(r.strikePrice) },
        { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
        { key: "sent", header: "Sent", sortValue: (r) => r.sentAt ?? "", cell: (r) => <span className="text-muted-foreground">{date(r.sentAt)}</span> },
        { key: "viewed", header: "Viewed", sortValue: (r) => r.viewedAt ?? "", cell: (r) => <span className="text-muted-foreground">{date(r.viewedAt)}</span> },
        { key: "accepted", header: "Accepted", sortValue: (r) => r.acceptedAt ?? "", cell: (r) => <span className="text-muted-foreground">{date(r.acceptedAt)}</span> },
        { key: "expires", header: "Expires", sortValue: (r) => r.expiresAt ?? "", cell: (r) => <span className={r.expiresAt && new Date(r.expiresAt) < new Date() && ["SENT", "VIEWED"].includes(r.status) ? "text-danger" : "text-muted-foreground"}>{date(r.expiresAt)}</span> },
      ]}
    />
  );
}
