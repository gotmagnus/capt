"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Plus, Users } from "lucide-react";
import { DataTable, FilterSelect } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { date, percent, shares } from "@/lib/format";
import { RELATIONSHIP_LABELS, STAKEHOLDER_RELATIONSHIPS, type StakeholderRelationship } from "@/lib/types";
import { StakeholderFormDialog } from "./stakeholder-form";

export interface StakeholderListRow {
  id: string;
  name: string;
  email: string | null;
  type: string;
  relationship: string;
  title: string | null;
  department: string | null;
  employmentStatus: string | null;
  outstandingShares: number;
  fullyDilutedShares: number;
  fullyDilutedPct: number;
  optionsOutstanding: number;
  invested: number;
  portalStatus: "ACCEPTED" | "INVITED" | "NOT_INVITED";
  createdAt: string;
}

const RELATIONSHIP_VARIANT: Record<string, "accent" | "success" | "purple" | "info" | "neutral" | "warning"> = {
  FOUNDER: "accent",
  INVESTOR: "purple",
  EMPLOYEE: "success",
  ADVISOR: "info",
  BOARD_MEMBER: "info",
  CONSULTANT: "info",
  FORMER_EMPLOYEE: "neutral",
  OTHER: "neutral",
};

export function RelationshipBadge({ relationship }: { relationship: string }) {
  return <Badge variant={RELATIONSHIP_VARIANT[relationship] ?? "neutral"}>{RELATIONSHIP_LABELS[relationship as StakeholderRelationship] ?? relationship}</Badge>;
}

export function StakeholderTable({ companyId, rows, canEdit }: { companyId: string; rows: StakeholderListRow[]; canEdit: boolean }) {
  const [relationship, setRelationship] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [holdings, setHoldings] = React.useState("");
  const filtered = rows.filter(
    (r) =>
      (!relationship || r.relationship === relationship) &&
      (!status || r.employmentStatus === status) &&
      (!holdings || (holdings === "WITH" ? r.fullyDilutedShares > 0 : r.fullyDilutedShares === 0)),
  );
  return (
    <DataTable
      rows={filtered}
      rowKey={(r) => r.id}
      searchable={(r) => `${r.name} ${r.email ?? ""} ${r.title ?? ""} ${r.department ?? ""}`}
      searchPlaceholder="Search name, email, title…"
      defaultSort={{ key: "fd", dir: "desc" }}
      rowHref={(r) => `/app/${companyId}/stakeholders/${r.id}`}
      emptyTitle="No stakeholders yet"
      emptyDescription="Add founders, investors, employees and advisors before issuing equity."
      emptyAction={canEdit ? <StakeholderFormDialog companyId={companyId} trigger={<Button><Plus /> Add stakeholder</Button>} redirectToDetail /> : undefined}
      filters={
        <>
          <FilterSelect label="Relationship" value={relationship} onChange={setRelationship} options={STAKEHOLDER_RELATIONSHIPS.map((r) => ({ value: r, label: RELATIONSHIP_LABELS[r] }))} />
          <FilterSelect label="Employment" value={status} onChange={setStatus} options={[{ value: "ACTIVE", label: "Active" }, { value: "ON_LEAVE", label: "On leave" }, { value: "TERMINATED", label: "Terminated" }]} />
          <FilterSelect label="Holdings" value={holdings} onChange={setHoldings} options={[{ value: "WITH", label: "With holdings" }, { value: "WITHOUT", label: "No holdings" }]} />
        </>
      }
      toolbar={
        <>
          <Button variant="secondary" size="sm" asChild>
            <a href={`/api/companies/${companyId}/exports/stakeholders`}>
              <Download /> CSV
            </a>
          </Button>
          {canEdit ? (
            <StakeholderFormDialog
              companyId={companyId}
              redirectToDetail
              trigger={
                <Button size="sm">
                  <Plus /> Add stakeholder
                </Button>
              }
            />
          ) : null}
        </>
      }
      columns={[
        {
          key: "name",
          header: "Stakeholder",
          cell: (r) => (
            <span className="flex items-center gap-2.5" title={r.name}>
              <Avatar name={r.name} size="sm" />
              <span className="min-w-0">
                <Link href={`/app/${companyId}/stakeholders/${r.id}`} className="block max-w-[190px] truncate font-medium hover:underline sm:max-w-[260px]">
                  {r.name}
                </Link>
                <span className="block max-w-[190px] truncate text-[11px] text-muted-foreground sm:max-w-[260px]">{r.email ?? (r.type === "ENTITY" ? "Entity" : "No email")}</span>
              </span>
            </span>
          ),
          sortValue: (r) => r.name,
        },
        { key: "relationship", header: "Relationship", cell: (r) => <RelationshipBadge relationship={r.relationship} />, sortValue: (r) => r.relationship },
        {
          key: "title",
          header: "Title · Department",
          cell: (r) => {
            const label = [r.title, r.department].filter(Boolean).join(" · ");
            return (
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="max-w-[190px] truncate 2xl:max-w-[280px]" title={label || undefined}>
                  {label || "—"}
                </span>
                {r.employmentStatus === "TERMINATED" ? <Badge variant="neutral">Terminated</Badge> : null}
              </span>
            );
          },
          sortValue: (r) => r.title ?? "",
        },
        { key: "outstanding", header: "Outstanding", align: "right", cell: (r) => (r.outstandingShares ? shares(r.outstandingShares) : <span className="text-subtle">—</span>), sortValue: (r) => r.outstandingShares },
        { key: "fd", header: "Fully diluted", align: "right", cell: (r) => (r.fullyDilutedShares ? shares(r.fullyDilutedShares) : <span className="text-subtle">—</span>), sortValue: (r) => r.fullyDilutedShares },
        { key: "pct", header: "% FD", align: "right", cell: (r) => (r.fullyDilutedPct ? percent(r.fullyDilutedPct) : <span className="text-subtle">—</span>), sortValue: (r) => r.fullyDilutedPct },
        {
          key: "portal",
          header: "Portal",
          cell: (r) =>
            r.portalStatus === "ACCEPTED" ? <Badge variant="success" dot>Active</Badge> : r.portalStatus === "INVITED" ? <Badge variant="warning" dot>Invited</Badge> : <Badge variant="neutral">Not invited</Badge>,
          sortValue: (r) => r.portalStatus,
        },
        { key: "created", header: "Added", className: "max-2xl:hidden", cell: (r) => <span className="text-muted-foreground">{date(r.createdAt)}</span>, sortValue: (r) => r.createdAt },
      ]}
    />
  );
}

export const StakeholdersIcon = Users;
