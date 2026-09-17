"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileBadge, Plus } from "lucide-react";
import { DataTable, FilterSelect, type Column } from "@/components/data-table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar, Progress } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { date, money, percent, price, shares } from "@/lib/format";
import { SECURITY_STATUSES, SECURITY_TYPE_LABELS, STATUS_LABELS, type SecurityType } from "@/lib/types";
import { GROUP_LABELS, type SecurityGroup } from "@/lib/securities-utils";
import { cn } from "@/lib/utils";
import { tabItemClass, tabStripClass } from "@/components/ui/tab-styles";

export interface SecurityRow {
  id: string;
  certificateNumber: string;
  stakeholderId: string;
  holderName: string;
  type: string;
  group: SecurityGroup;
  className: string | null;
  planName: string | null;
  planId: string | null;
  quantity: number;
  exercised: number;
  cancelled: number;
  principal: number | null;
  price: number | null;
  issueDate: string;
  vestedPct: number | null;
  vested: number | null;
  status: string;
}

const TABS: { value: string; label: string; group?: SecurityGroup }[] = [
  { value: "all", label: "All" },
  { value: "shares", label: "Shares", group: "SHARES" },
  { value: "options", label: "Options", group: "OPTIONS" },
  { value: "rsu", label: "RSUs & RSAs", group: "RSU_RSA" },
  { value: "warrants", label: "Warrants", group: "WARRANTS" },
  { value: "convertibles", label: "Convertibles", group: "CONVERTIBLES" },
];

export function SecuritiesList({
  companyId,
  rows,
  stakeholders,
  plans,
  initialType,
  initialStakeholder,
  initialStatus,
  canEdit,
}: {
  companyId: string;
  rows: SecurityRow[];
  stakeholders: { id: string; name: string }[];
  plans: { id: string; name: string }[];
  initialType: string;
  initialStakeholder: string;
  initialStatus: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(TABS.some((t) => t.value === initialType) ? initialType : "all");
  const [status, setStatus] = useState(initialStatus);
  const [holder, setHolder] = useState(initialStakeholder);
  const [plan, setPlan] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const t of TABS) if (t.group) c[t.value] = rows.filter((r) => r.group === t.group).length;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const group = TABS.find((t) => t.value === tab)?.group;
    return rows.filter((r) => (!group || r.group === group) && (!status || r.status === status) && (!holder || r.stakeholderId === holder) && (!plan || r.planId === plan));
  }, [rows, tab, status, holder, plan]);

  const columns: Column<SecurityRow>[] = [
    {
      key: "cert",
      header: "Certificate",
      cell: (r) => (
        <div>
          <Link href={`/app/${companyId}/securities/${r.id}`} className="font-mono text-xs font-medium hover:underline">
            {r.certificateNumber}
          </Link>
          {/* Below 2xl the Issued column is folded in here so Status still fits without scrolling. */}
          <div className="text-[11px] text-muted-foreground 2xl:hidden">{date(r.issueDate)}</div>
        </div>
      ),
      sortValue: (r) => r.certificateNumber,
      width: 110,
    },
    {
      key: "holder",
      header: "Holder",
      cell: (r) => (
        <Link href={`/app/${companyId}/stakeholders/${r.stakeholderId}`} className="flex items-center gap-2 hover:underline" title={r.holderName}>
          <Avatar name={r.holderName} size="xs" />
          <span className="max-w-[200px] truncate 2xl:max-w-[240px]">{r.holderName}</span>
        </Link>
      ),
      sortValue: (r) => r.holderName,
    },
    {
      key: "type",
      header: "Type · class / plan",
      cell: (r) => {
        const source = r.group === "OPTIONS" || r.group === "RSU_RSA" ? r.planName ?? r.className : r.className;
        return (
          <div>
            <Badge variant="outline">{SECURITY_TYPE_LABELS[r.type as SecurityType] ?? r.type}</Badge>
            {source ? (
              <div className="mt-1 max-w-[190px] truncate text-[11px] text-muted-foreground" title={source}>
                {source}
              </div>
            ) : null}
          </div>
        );
      },
      sortValue: (r) => `${r.type} ${r.planName ?? r.className ?? ""}`,
    },
    {
      key: "quantity",
      header: "Quantity",
      align: "right",
      cell: (r) =>
        r.group === "CONVERTIBLES" ? (
          <span>{money(r.principal)}</span>
        ) : (
          <div>
            <div>{shares(r.quantity)}</div>
            {r.exercised || r.cancelled ? (
              <div className="text-[11px] leading-snug text-muted-foreground">
                {r.exercised ? <div>{shares(r.exercised)} exercised</div> : null}
                {r.cancelled ? <div>{shares(r.cancelled)} cancelled</div> : null}
              </div>
            ) : null}
          </div>
        ),
      sortValue: (r) => (r.group === "CONVERTIBLES" ? r.principal ?? 0 : r.quantity),
    },
    {
      key: "price",
      header: "Price / strike",
      align: "right",
      cell: (r) => <span className="text-muted-foreground">{r.price != null ? price(r.price) : "—"}</span>,
      sortValue: (r) => r.price ?? -1,
    },
    {
      key: "issued",
      header: "Issued",
      className: "max-2xl:hidden",
      cell: (r) => <span className="text-muted-foreground">{date(r.issueDate)}</span>,
      sortValue: (r) => r.issueDate,
    },
    {
      key: "vesting",
      header: "Vesting",
      cell: (r) =>
        r.vestedPct == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex items-center gap-2">
            <Progress value={r.vestedPct * 100} className="w-16 shrink-0" tone={r.vestedPct >= 1 ? "success" : "accent"} />
            <span className={cn("text-xs tabular", r.vestedPct >= 1 ? "text-success" : "text-muted-foreground")}>{percent(r.vestedPct, 0)}</span>
          </div>
        ),
      sortValue: (r) => r.vestedPct ?? -1,
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} />, sortValue: (r) => r.status },
  ];

  return (
    <div className="space-y-4">
      <div className={tabStripClass} role="tablist" aria-label="Security type">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => {
              setTab(t.value);
              router.replace(t.value === "all" ? "?" : `?type=${t.value}`, { scroll: false });
            }}
            role="tab"
            aria-selected={tab === t.value}
            className={tabItemClass(tab === t.value)}
          >
            {t.label}
            <span className="rounded-full bg-muted px-1.5 text-[10.5px] text-muted-foreground tabular">{counts[t.value] ?? 0}</span>
          </button>
        ))}
      </div>
      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.id}
        searchable={(r) => `${r.certificateNumber} ${r.holderName} ${r.className ?? ""} ${r.planName ?? ""} ${SECURITY_TYPE_LABELS[r.type as SecurityType] ?? r.type}`}
        searchPlaceholder="Search certificate, holder…"
        defaultSort={{ key: "issued", dir: "desc" }}
        rowHref={(r) => `/app/${companyId}/securities/${r.id}`}
        filters={
          <>
            <FilterSelect label="Status" value={status} onChange={setStatus} options={SECURITY_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))} />
            <FilterSelect label="Holder" value={holder} onChange={setHolder} options={stakeholders.map((s) => ({ value: s.id, label: s.name }))} />
            {plans.length ? <FilterSelect label="Plan" value={plan} onChange={setPlan} options={plans.map((p) => ({ value: p.id, label: p.name }))} /> : null}
          </>
        }
        toolbar={<span className="text-xs text-muted-foreground tabular">{filtered.length} of {rows.length}</span>}
        emptyTitle={tab === "all" ? "No securities issued yet" : `No ${GROUP_LABELS[TABS.find((t) => t.value === tab)?.group ?? "SHARES"].toLowerCase()} found`}
        emptyDescription="Issue shares, options, SAFEs or notes and they will appear here with their vesting and status."
        emptyAction={
          canEdit ? (
            <Button asChild>
              <Link href={`/app/${companyId}/securities/new`}>
                <Plus /> Issue equity
              </Link>
            </Button>
          ) : (
            <FileBadge className="size-5 text-muted-foreground" />
          )
        }
      />
    </div>
  );
}
