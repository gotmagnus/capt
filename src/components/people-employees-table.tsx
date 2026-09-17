"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, FilterSelect } from "@/components/data-table";
import { Avatar } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { date, money, percent, price, shares } from "@/lib/format";
import { RELATIONSHIP_LABELS, type StakeholderRelationship } from "@/lib/types";
import type { EmployeeRow } from "@/lib/people-data";

export function EmployeesTable({ companyId, rows, departments, fmv }: { companyId: string; rows: EmployeeRow[]; departments: string[]; fmv: number | null }) {
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");
  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (dept && r.department !== dept) return false;
        if (status === "ACTIVE" && !(r.employmentStatus === "ACTIVE" && r.relationship !== "FORMER_EMPLOYEE")) return false;
        if (status === "FORMER" && !(r.relationship === "FORMER_EMPLOYEE" || r.employmentStatus === "TERMINATED")) return false;
        if (status === "ADVISOR" && !["ADVISOR", "CONSULTANT"].includes(r.relationship)) return false;
        if (status === "REFRESH" && !r.refreshDue) return false;
        return true;
      }),
    [rows, dept, status],
  );
  const totals = filtered.reduce(
    (a, r) => ({ granted: a.granted + r.granted, vested: a.vested + r.vested, unvested: a.unvested + r.unvested, exercisable: a.exercisable + r.exercisable, exercised: a.exercised + r.exercised, value: a.value + r.vestedValue }),
    { granted: 0, vested: 0, unvested: 0, exercisable: 0, exercised: 0, value: 0 },
  );
  return (
    <DataTable
      rows={filtered}
      rowKey={(r) => r.stakeholderId}
      searchable={(r) => `${r.name} ${r.email ?? ""} ${r.title ?? ""} ${r.department ?? ""}`}
      searchPlaceholder="Search employees…"
      defaultSort={{ key: "granted", dir: "desc" }}
      emptyTitle="No employees match"
      filters={
        <>
          <FilterSelect label="Department" value={dept} onChange={setDept} options={departments.map((d) => ({ value: d, label: d }))} />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "FORMER", label: "Former" },
              { value: "ADVISOR", label: "Advisors & consultants" },
              { value: "REFRESH", label: "Refresh due" },
            ]}
          />
        </>
      }
      toolbar={<span className="text-xs text-muted-foreground">{filtered.length} people</span>}
      columns={[
        {
          key: "name",
          header: "Name",
          sortValue: (r) => r.name,
          cell: (r) => (
            <Link href={`/app/${companyId}/stakeholders/${r.stakeholderId}`} className="flex items-center gap-2 hover:underline">
              <Avatar name={r.name} size="sm" />
              <span>
                <span className="block font-medium">{r.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.title ?? RELATIONSHIP_LABELS[r.relationship as StakeholderRelationship]}
                  {r.department ? ` · ${r.department}` : ""}
                </span>
              </span>
            </Link>
          ),
        },
        { key: "start", header: "Start date", sortValue: (r) => r.startDate ?? "", cell: (r) => <span className="text-muted-foreground">{date(r.startDate)}</span> },
        {
          key: "status",
          header: "Status",
          sortValue: (r) => r.employmentStatus ?? r.relationship,
          cell: (r) => (
            <span className="flex items-center gap-1.5">
              {r.employmentStatus ? <StatusBadge status={r.employmentStatus} /> : <Badge variant="neutral">{RELATIONSHIP_LABELS[r.relationship as StakeholderRelationship]}</Badge>}
              {r.refreshDue ? <Badge variant="purple">Refresh due</Badge> : null}
            </span>
          ),
        },
        { key: "grants", header: "Grants", align: "right", sortValue: (r) => r.grantCount, cell: (r) => r.grantCount },
        { key: "granted", header: "Granted", align: "right", sortValue: (r) => r.granted, cell: (r) => shares(r.granted) },
        {
          key: "vested",
          header: "Vested",
          align: "right",
          sortValue: (r) => r.vested,
          cell: (r) => (
            <span>
              {shares(r.vested)} <span className="text-xs text-muted-foreground">({percent(r.percentVested, 0)})</span>
            </span>
          ),
        },
        { key: "unvested", header: "Unvested", align: "right", sortValue: (r) => r.unvested, cell: (r) => shares(r.unvested) },
        { key: "exercisable", header: "Exercisable", align: "right", sortValue: (r) => r.exercisable, cell: (r) => shares(r.exercisable) },
        { key: "exercised", header: "Exercised", align: "right", sortValue: (r) => r.exercised, cell: (r) => shares(r.exercised) },
        {
          key: "next",
          header: "Next vest",
          sortValue: (r) => r.nextVestDate ?? "9999",
          cell: (r) => (r.nextVestDate ? <span>{date(r.nextVestDate)} <span className="text-xs text-muted-foreground">· {shares(r.nextVestAmount)}</span></span> : <span className="text-muted-foreground">—</span>),
        },
        { key: "strike", header: "Avg strike", align: "right", sortValue: (r) => r.avgStrike ?? 0, cell: (r) => price(r.avgStrike) },
        { key: "value", header: fmv ? "Vested value" : "Vested value (no FMV)", align: "right", sortValue: (r) => r.vestedValue, cell: (r) => <span className="font-medium">{money(r.vestedValue)}</span> },
      ]}
      footer={
        <tr>
          <td colSpan={4}>Total</td>
          <td className="num">{shares(totals.granted)}</td>
          <td className="num">{shares(totals.vested)}</td>
          <td className="num">{shares(totals.unvested)}</td>
          <td className="num">{shares(totals.exercisable)}</td>
          <td className="num">{shares(totals.exercised)}</td>
          <td colSpan={2}></td>
          <td className="num">{money(totals.value)}</td>
        </tr>
      }
    />
  );
}
