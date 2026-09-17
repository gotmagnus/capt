"use client";

import * as React from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { DataTable, FilterSelect } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { date, money, price, shares } from "@/lib/format";
import { TRANSACTION_LABELS, TRANSACTION_TYPES, type TransactionType } from "@/lib/types";
import { TRANSACTION_TYPE_VARIANT } from "./type-variant";

export interface TransactionRow {
  id: string;
  effectiveDate: string;
  type: string;
  securityId: string | null;
  certificateNumber: string | null;
  securityType: string | null;
  fromId: string | null;
  fromName: string | null;
  toId: string | null;
  toName: string | null;
  quantity: number;
  pricePerShare: number | null;
  totalAmount: number | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export function TransactionsTable({ companyId, rows, stakeholders, initialStakeholder, toolbar }: { companyId: string; rows: TransactionRow[]; stakeholders: { id: string; name: string }[]; initialStakeholder?: string; toolbar?: React.ReactNode }) {
  const [type, setType] = React.useState("");
  const [stakeholder, setStakeholder] = React.useState(initialStakeholder ?? "");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const filtered = rows.filter((r) => {
    if (type && r.type !== type) return false;
    if (stakeholder && r.fromId !== stakeholder && r.toId !== stakeholder) return false;
    const d = r.effectiveDate.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
  const query = new URLSearchParams();
  if (type) query.set("type", type);
  if (stakeholder) query.set("stakeholder", stakeholder);
  if (from) query.set("from", from);
  if (to) query.set("to", to);

  return (
    <DataTable
      rows={filtered}
      rowKey={(r) => r.id}
      searchable={(r) => `${r.certificateNumber ?? ""} ${r.fromName ?? ""} ${r.toName ?? ""} ${r.notes ?? ""} ${r.type}`}
      searchPlaceholder="Search certificate, stakeholder, notes…"
      defaultSort={{ key: "date", dir: "desc" }}
      emptyTitle="No transactions"
      emptyDescription="Issuances, exercises, cancellations and transfers are recorded here automatically."
      filters={
        <>
          <FilterSelect label="Type" value={type} onChange={setType} options={TRANSACTION_TYPES.map((t) => ({ value: t, label: TRANSACTION_LABELS[t] }))} />
          <FilterSelect label="Stakeholder" value={stakeholder} onChange={setStakeholder} options={stakeholders.map((s) => ({ value: s.id, label: s.name }))} />
          <span className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" aria-label="From date" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" aria-label="To date" />
          </span>
        </>
      }
      toolbar={
        <>
          <span className="text-xs text-muted-foreground">{filtered.length} transactions</span>
          <Button variant="secondary" size="sm" asChild>
            <a href={`/api/companies/${companyId}/exports/transactions${query.toString() ? `?${query}` : ""}`}>
              <Download /> CSV
            </a>
          </Button>
          {toolbar}
        </>
      }
      columns={[
        { key: "date", header: "Date", cell: (r) => date(r.effectiveDate), sortValue: (r) => `${r.effectiveDate}${r.createdAt}` },
        { key: "type", header: "Type", cell: (r) => <Badge variant={TRANSACTION_TYPE_VARIANT[r.type] ?? "neutral"}>{TRANSACTION_LABELS[r.type as TransactionType] ?? r.type}</Badge>, sortValue: (r) => r.type },
        {
          key: "security",
          header: "Security",
          cell: (r) =>
            r.securityId ? (
              <Link href={`/app/${companyId}/securities/${r.securityId}`} className="font-mono text-xs hover:underline" data-no-row>
                {r.certificateNumber}
              </Link>
            ) : (
              <span className="text-subtle">—</span>
            ),
          sortValue: (r) => r.certificateNumber ?? "",
        },
        {
          key: "from",
          header: "From",
          cell: (r) =>
            r.fromId ? (
              <Link href={`/app/${companyId}/stakeholders/${r.fromId}`} className="hover:underline" data-no-row>
                {r.fromName}
              </Link>
            ) : (
              <span className="text-subtle">{r.type === "ISSUANCE" ? "Company" : "—"}</span>
            ),
          sortValue: (r) => r.fromName ?? "",
        },
        {
          key: "to",
          header: "To",
          cell: (r) =>
            r.toId ? (
              <Link href={`/app/${companyId}/stakeholders/${r.toId}`} className="hover:underline" data-no-row>
                {r.toName}
              </Link>
            ) : (
              <span className="text-subtle">{["CANCELLATION", "REPURCHASE"].includes(r.type) ? "Company" : "—"}</span>
            ),
          sortValue: (r) => r.toName ?? "",
        },
        { key: "qty", header: "Quantity", align: "right", cell: (r) => (r.quantity ? shares(r.quantity) : <span className="text-subtle">—</span>), sortValue: (r) => r.quantity },
        { key: "price", header: "Price", align: "right", cell: (r) => (r.pricePerShare != null ? price(r.pricePerShare) : <span className="text-subtle">—</span>), sortValue: (r) => r.pricePerShare },
        { key: "amount", header: "Amount", align: "right", cell: (r) => (r.totalAmount != null ? money(r.totalAmount, { cents: true }) : <span className="text-subtle">—</span>), sortValue: (r) => r.totalAmount },
        { key: "notes", header: "Notes", cell: (r) => <span className="block max-w-[240px] truncate text-muted-foreground min-[1600px]:max-w-[360px]" title={r.notes ?? undefined}>{r.notes ?? "—"}</span> },
        { key: "by", header: "Recorded by", className: "hidden min-[1600px]:table-cell", cell: (r) => <span className="text-muted-foreground">{r.recordedBy ?? "System"}</span>, sortValue: (r) => r.recordedBy ?? "" },
      ]}
    />
  );
}
