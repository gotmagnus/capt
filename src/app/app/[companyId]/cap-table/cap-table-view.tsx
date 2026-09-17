"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Search, X } from "lucide-react";
import type { CapTableSummary, CapTableRow } from "@/lib/equity/captable";
import { cn } from "@/lib/utils";
import { compactMoney, date, money, percent, price, shares } from "@/lib/format";
import { RELATIONSHIP_LABELS, SECURITY_TYPE_LABELS, STATUS_LABELS, type SecurityType, type StakeholderRelationship } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stat, TableWrap } from "@/components/ui/page";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar, Switch } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHART_COLORS } from "@/components/charts";
import { DataTable, FilterSelect } from "@/components/data-table";

export interface LedgerRow {
  id: string;
  certificateNumber: string;
  holderId: string;
  holderName: string;
  type: string;
  typeLabel: string;
  classOrPlan: string;
  quantity: number | null;
  principal: number | null;
  price: number | null;
  issueDate: string;
  status: string;
}

export interface ConvertibleRow {
  id: string;
  certificateNumber: string;
  holderId: string;
  holderName: string;
  type: string;
  principal: number;
  valuationCap: number | null;
  discountPercent: number | null;
  safeType: string | null;
  mfn: boolean;
  proRataRight: boolean;
  interestRate: number | null;
  maturityDate: string | null;
  issueDate: string;
  accruedInterest: number;
}

const GROUPS: { key: string; label: string; match: (r: string) => boolean }[] = [
  { key: "founders", label: "Founders", match: (r) => r === "FOUNDER" },
  { key: "investors", label: "Investors", match: (r) => r === "INVESTOR" },
  { key: "employees", label: "Employees", match: (r) => r === "EMPLOYEE" || r === "FORMER_EMPLOYEE" },
  { key: "advisors", label: "Advisors, consultants & board", match: (r) => r === "ADVISOR" || r === "CONSULTANT" || r === "BOARD_MEMBER" },
  { key: "other", label: "Other", match: () => true },
];

export function CapTableView({
  companyId,
  asOf,
  isHistorical,
  initialTab,
  summary,
  preferredClasses,
  ledger,
  convertibles,
}: {
  companyId: string;
  asOf: string;
  isHistorical: boolean;
  initialTab: string;
  summary: CapTableSummary;
  preferredClasses: { id: string; name: string; prefix: string }[];
  ledger: LedgerRow[];
  convertibles: ConvertibleRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState(initialTab);
  const [grouped, setGrouped] = React.useState(false);
  const [q, setQ] = React.useState("");
  const t = summary.totals;

  const setAsOf = (value: string) => {
    const params = new URLSearchParams();
    if (value) params.set("asOf", value);
    if (tab !== "stakeholders") params.set("tab", tab);
    router.push(`/app/${companyId}/cap-table${params.toString() ? `?${params}` : ""}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-lg border border-border bg-card px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <Label htmlFor="asOf" className="text-muted-foreground">
            As of
          </Label>
          <Input id="asOf" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-8 w-40" max={new Date().toISOString().slice(0, 10)} />
          {isHistorical ? (
            <button onClick={() => setAsOf("")} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-medium text-warning hover:brightness-95">
              Historical view <X className="size-3" />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="grouped" className="text-muted-foreground">
            Group by relationship
          </Label>
          <Switch id="grouped" checked={grouped} onCheckedChange={setGrouped} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <Stat label="Outstanding shares" value={shares(t.outstandingShares)} hint={`${shares(t.commonOutstanding)} common · ${shares(t.preferredOutstanding)} preferred`} />
        <Stat label="Fully diluted" value={shares(t.fullyDilutedShares)} hint="Incl. options, RSUs, warrants & pool" />
        <Stat label="Options outstanding" value={shares(t.optionsOutstanding)} hint={`${shares(t.optionsVested)} vested`} />
        <Stat label="Pool available" value={shares(t.poolAvailable)} hint={`of ${shares(t.poolAuthorized)} authorized`} />
        <Stat label="SAFEs & notes" value={compactMoney(t.safePrincipal + t.notePrincipal)} hint={`${t.safeCount} SAFE${t.safeCount === 1 ? "" : "s"} · ${t.noteCount} note${t.noteCount === 1 ? "" : "s"} unconverted`} />
        <Stat label="Total invested" value={compactMoney(t.totalInvested)} hint={`${compactMoney(t.totalLiquidationPreference)} liquidation preference`} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="stakeholders">By stakeholder</TabsTrigger>
          <TabsTrigger value="classes">By share class</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="convertibles">
            Convertibles {convertibles.length ? <Badge variant="neutral">{convertibles.length}</Badge> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stakeholders">
          {/* The ledger needs the full width to show % fully diluted without scrolling, so ownership is a slim bar above it rather than a side card. */}
          <div className="space-y-4">
            <OwnershipBar groups={summary.groups} />
            <StakeholderTable companyId={companyId} summary={summary} preferredClasses={preferredClasses} grouped={grouped} q={q} setQ={setQ} />
          </div>
        </TabsContent>

        <TabsContent value="classes">
          <ShareClassTable companyId={companyId} summary={summary} />
        </TabsContent>

        <TabsContent value="ledger">
          <LedgerTable companyId={companyId} rows={ledger} />
        </TabsContent>

        <TabsContent value="convertibles">
          <ConvertiblesTable companyId={companyId} rows={convertibles} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OwnershipBar({ groups }: { groups: CapTableSummary["groups"] }) {
  const total = groups.reduce((a, g) => a + g.fullyDilutedShares, 0);
  if (!total) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="text-[13px] font-semibold">Ownership</h3>
        <span className="text-xs text-muted-foreground">Fully diluted by group</span>
      </div>
      <div className="mt-2.5 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={groups.map((g) => `${g.label} ${percent(g.fullyDilutedShares / total, 1)}`).join(", ")}>
        {groups.map((g, i) =>
          g.fullyDilutedShares > 0 ? <span key={g.key} className="h-full min-w-[3px]" style={{ flexGrow: g.fullyDilutedShares, flexBasis: 0, background: CHART_COLORS[i % CHART_COLORS.length] }} title={`${g.label} · ${shares(g.fullyDilutedShares)} (${percent(g.fullyDilutedShares / total, 1)})`} /> : null,
        )}
      </div>
      <ul className="mt-3 grid gap-y-1.5 text-[13px] sm:flex sm:flex-wrap sm:gap-x-6">
        {groups.map((g, i) => (
          <li key={g.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate sm:flex-none">{g.label}</span>
            <span className="tabular text-muted-foreground">{percent(g.fullyDilutedShares / total, 1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** First column stays put while the numbers scroll sideways on narrow screens. */
const stickyCol = "sticky left-0 shadow-[inset_-1px_0_0_var(--border)]";

function StakeholderTable({
  companyId,
  summary,
  preferredClasses,
  grouped,
  q,
  setQ,
}: {
  companyId: string;
  summary: CapTableSummary;
  preferredClasses: { id: string; name: string; prefix: string }[];
  grouped: boolean;
  q: string;
  setQ: (v: string) => void;
}) {
  const t = summary.totals;
  const ql = q.trim().toLowerCase();
  const rows = ql ? summary.rows.filter((r) => r.name.toLowerCase().includes(ql) || (RELATIONSHIP_LABELS[r.relationship as StakeholderRelationship] ?? r.relationship).toLowerCase().includes(ql)) : summary.rows;
  const classIssued = Object.fromEntries(summary.classTotals.map((c) => [c.shareClassId, c.issued]));
  const showRsus = t.rsus > 0;
  const showWarrants = t.warrants > 0;
  const colCount = 2 + preferredClasses.length + 1 + (showRsus ? 1 : 0) + (showWarrants ? 1 : 0) + 4;

  const renderRow = (r: CapTableRow) => (
    <tr key={r.stakeholderId} className="group">
      <td className={cn(stickyCol, "z-[1] bg-card group-hover:bg-[#fafbfc]")}>
        <Link href={`/app/${companyId}/stakeholders/${r.stakeholderId}`} className="flex items-center gap-2.5 hover:underline" title={r.name}>
          <Avatar name={r.name} size="sm" className="hidden sm:inline-flex" />
          <span className="min-w-0">
            <span className="block max-w-[132px] truncate font-medium sm:max-w-[240px]">{r.name}</span>
            <span className="block text-[11px] text-muted-foreground">{RELATIONSHIP_LABELS[r.relationship as StakeholderRelationship] ?? r.relationship}</span>
          </span>
        </Link>
      </td>
      <td className="num">{r.commonShares ? shares(r.commonShares) : <span className="text-subtle">—</span>}</td>
      {preferredClasses.map((c) => (
        <td key={c.id} className="num">
          {r.byClass[c.id] ? shares(r.byClass[c.id]) : <span className="text-subtle">—</span>}
        </td>
      ))}
      <td className="num">
        {r.optionsOutstanding ? (
          <span title={`${shares(r.optionsVested)} vested`}>
            <span className="block">{shares(r.optionsOutstanding)}</span>
            <span className="block text-[11px] text-muted-foreground">{percent(r.optionsOutstanding ? r.optionsVested / r.optionsOutstanding : 0, 0)} vested</span>
          </span>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </td>
      {showRsus ? <td className="num">{r.rsus ? shares(r.rsus) : <span className="text-subtle">—</span>}</td> : null}
      {showWarrants ? <td className="num">{r.warrants ? shares(r.warrants) : <span className="text-subtle">—</span>}</td> : null}
      <td className="num font-medium">{shares(r.outstandingShares)}</td>
      <td className="num">{percent(r.outstandingPct)}</td>
      <td className="num font-medium">{shares(r.fullyDilutedShares)}</td>
      <td className="num">{percent(r.fullyDilutedPct)}</td>
    </tr>
  );

  const groupedRows = GROUPS.map((g) => ({ ...g, rows: [] as CapTableRow[] }));
  if (grouped) {
    for (const r of rows) {
      const idx = GROUPS.findIndex((g) => g.match(r.relationship));
      groupedRows[idx === -1 ? groupedRows.length - 1 : idx].rows.push(r);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
        <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stakeholders…" className="h-8 pl-8" />
        </div>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular">
          {rows.length} of {summary.rows.length} stakeholders
        </span>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="data-table">
          <thead>
            <tr>
              <th className={cn(stickyCol, "z-[2]")}>Stakeholder</th>
              <th className="text-right">Common</th>
              {preferredClasses.map((c) => (
                <th key={c.id} className="text-right">
                  {c.name.replace(" Preferred", "")}
                </th>
              ))}
              <th className="text-right">Options</th>
              {showRsus ? <th className="text-right">RSUs</th> : null}
              {showWarrants ? <th className="text-right">Warrants</th> : null}
              <th className="text-right">Outstanding</th>
              <th className="text-right">% Outstanding</th>
              <th className="text-right">Fully diluted</th>
              <th className="text-right">% FD</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="py-10 text-center text-muted-foreground">
                  No stakeholders match your search.
                </td>
              </tr>
            ) : null}
            {grouped
              ? groupedRows
                  .filter((g) => g.rows.length)
                  .map((g) => {
                    const fd = g.rows.reduce((a, r) => a + r.fullyDilutedShares, 0);
                    const out = g.rows.reduce((a, r) => a + r.outstandingShares, 0);
                    return (
                      <React.Fragment key={g.key}>
                        <tr>
                          <td colSpan={colCount} className="bg-muted/60 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {/* Pinned to the left edge so the label survives sideways scrolling; phones get the short form. */}
                            <span className="sticky left-3">
                              {g.label} · {g.rows.length}
                              <span className="max-sm:hidden">
                                {" "}
                                · {shares(out)} outstanding ({percent(t.outstandingShares ? out / t.outstandingShares : 0, 1)}) · {shares(fd)} FD ({percent(t.fullyDilutedShares ? fd / t.fullyDilutedShares : 0, 1)})
                              </span>
                              <span className="sm:hidden"> · {percent(t.fullyDilutedShares ? fd / t.fullyDilutedShares : 0, 1)} FD</span>
                            </span>
                          </td>
                        </tr>
                        {g.rows.map(renderRow)}
                      </React.Fragment>
                    );
                  })
              : rows.map(renderRow)}
            {!ql ? (
              <tr className="bg-accent-soft/40">
                <td className={cn(stickyCol, "z-[1] bg-[color-mix(in_srgb,var(--accent-soft)_40%,var(--card))]")}>
                  <span className="flex items-center gap-2.5">
                    <span className="hidden size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent-foreground sm:flex">P</span>
                    <span>
                      <span className="block font-medium">
                        Unallocated <span className="max-sm:hidden">option </span>pool
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        Available <span className="max-sm:hidden">for future grants</span>
                        <span className="sm:hidden">to grant</span>
                      </span>
                    </span>
                  </span>
                </td>
                <td className="num text-subtle">—</td>
                {preferredClasses.map((c) => (
                  <td key={c.id} className="num text-subtle">
                    —
                  </td>
                ))}
                <td className="num">{shares(t.poolAvailable)}</td>
                {showRsus ? <td className="num text-subtle">—</td> : null}
                {showWarrants ? <td className="num text-subtle">—</td> : null}
                <td className="num text-subtle">—</td>
                <td className="num text-subtle">—</td>
                <td className="num font-medium">{shares(t.poolAvailable)}</td>
                <td className="num">{percent(t.fullyDilutedShares ? t.poolAvailable / t.fullyDilutedShares : 0)}</td>
              </tr>
            ) : null}
          </tbody>
          {!ql ? (
            <tfoot>
              <tr>
                <td className={cn(stickyCol, "z-[1]")}>Total</td>
                <td className="num">{shares(t.commonOutstanding)}</td>
                {preferredClasses.map((c) => (
                  <td key={c.id} className="num">
                    {shares(classIssued[c.id] ?? 0)}
                  </td>
                ))}
                <td className="num">{shares(t.optionsOutstanding + t.poolAvailable)}</td>
                {showRsus ? <td className="num">{shares(t.rsus)}</td> : null}
                {showWarrants ? <td className="num">{shares(t.warrants)}</td> : null}
                <td className="num">{shares(t.outstandingShares)}</td>
                <td className="num">100.00%</td>
                <td className="num">{shares(t.fullyDilutedShares)}</td>
                <td className="num">100.00%</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

function ShareClassTable({ companyId, summary }: { companyId: string; summary: CapTableSummary }) {
  const t = summary.totals;
  const totalAuthorized = summary.classTotals.reduce((a, c) => a + c.authorized, 0);
  const totalIssued = summary.classTotals.reduce((a, c) => a + c.issued, 0);
  const totalReserved = summary.classTotals.reduce((a, c) => a + c.reservedForPlans, 0);
  return (
    <TableWrap>
      <table className="data-table">
        <thead>
          <tr>
            <th>Share class</th>
            <th>Type</th>
            <th className="text-right">Authorized</th>
            <th className="text-right">Issued</th>
            <th className="text-right">As-converted</th>
            <th className="text-right">Reserved for plans</th>
            <th className="text-right">Available</th>
            <th className="text-right">% Outstanding</th>
            <th className="text-right">% FD</th>
            <th className="text-right">Liquidation preference</th>
          </tr>
        </thead>
        <tbody>
          {summary.classTotals.map((c) => (
            <tr key={c.shareClassId}>
              <td>
                <Link href={`/app/${companyId}/share-classes`} className="font-medium hover:underline">
                  {c.name}
                </Link>
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">{c.prefix}</span>
              </td>
              <td>
                <Badge variant={c.type === "PREFERRED" ? "purple" : "neutral"}>{c.type === "PREFERRED" ? "Preferred" : "Common"}</Badge>
              </td>
              <td className="num">{shares(c.authorized)}</td>
              <td className="num font-medium">{shares(c.issued)}</td>
              <td className="num">{shares(c.asConverted)}</td>
              <td className="num">{c.reservedForPlans ? shares(c.reservedForPlans) : <span className="text-subtle">—</span>}</td>
              <td className={cn("num", c.available < c.authorized * 0.05 && "text-warning")}>{shares(c.available)}</td>
              <td className="num">{percent(c.outstandingPct)}</td>
              <td className="num">{percent(c.fullyDilutedPct)}</td>
              <td className="num">{c.liquidationPreference ? money(c.liquidationPreference) : <span className="text-subtle">—</span>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Total</td>
            <td className="num">{shares(totalAuthorized)}</td>
            <td className="num">{shares(totalIssued)}</td>
            <td className="num">{shares(t.outstandingShares)}</td>
            <td className="num">{shares(totalReserved)}</td>
            <td className="num">{shares(Math.max(0, totalAuthorized - totalIssued - totalReserved))}</td>
            <td className="num">100.00%</td>
            <td className="num">{percent(t.fullyDilutedShares ? t.outstandingShares / t.fullyDilutedShares : 0)}</td>
            <td className="num">{money(t.totalLiquidationPreference)}</td>
          </tr>
        </tfoot>
      </table>
    </TableWrap>
  );
}

function LedgerTable({ companyId, rows }: { companyId: string; rows: LedgerRow[] }) {
  const [type, setType] = React.useState("");
  const [status, setStatus] = React.useState("");
  const filtered = rows.filter((r) => (!type || r.type === type) && (!status || r.status === status));
  const types = [...new Set(rows.map((r) => r.type))].map((t) => ({ value: t, label: SECURITY_TYPE_LABELS[t as SecurityType] ?? t }));
  const statuses = [...new Set(rows.map((r) => r.status))].map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) }));
  return (
    <DataTable
      rows={filtered}
      rowKey={(r) => r.id}
      searchable={(r) => `${r.certificateNumber} ${r.holderName} ${r.typeLabel} ${r.classOrPlan}`}
      searchPlaceholder="Search certificate, holder…"
      defaultSort={{ key: "issueDate", dir: "desc" }}
      rowHref={(r) => `/app/${companyId}/securities/${r.id}`}
      filters={
        <>
          <FilterSelect label="Type" value={type} onChange={setType} options={types} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={statuses} />
        </>
      }
      toolbar={<span className="text-xs text-muted-foreground">{filtered.length} securities</span>}
      emptyTitle="No securities issued"
      emptyDescription="Issued shares, options, SAFEs and notes appear here."
      columns={[
        { key: "cert", header: "Certificate", cell: (r) => <span className="font-mono text-xs">{r.certificateNumber}</span>, sortValue: (r) => r.certificateNumber },
        {
          key: "holder",
          header: "Holder",
          cell: (r) => (
            <Link href={`/app/${companyId}/stakeholders/${r.holderId}`} className="hover:underline" data-no-row>
              {r.holderName}
            </Link>
          ),
          sortValue: (r) => r.holderName,
        },
        { key: "type", header: "Type", cell: (r) => <Badge variant="outline">{r.typeLabel}</Badge>, sortValue: (r) => r.typeLabel },
        { key: "class", header: "Class / plan", cell: (r) => <span className="text-muted-foreground">{r.classOrPlan}</span>, sortValue: (r) => r.classOrPlan },
        { key: "qty", header: "Quantity", align: "right", cell: (r) => (r.quantity != null ? shares(r.quantity) : money(r.principal)), sortValue: (r) => r.quantity ?? r.principal ?? 0 },
        { key: "price", header: "Price / strike", align: "right", cell: (r) => (r.price != null ? price(r.price) : "—"), sortValue: (r) => r.price },
        { key: "issueDate", header: "Issue date", cell: (r) => date(r.issueDate), sortValue: (r) => r.issueDate },
        { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} />, sortValue: (r) => r.status },
      ]}
    />
  );
}

function ConvertiblesTable({ companyId, rows }: { companyId: string; rows: ConvertibleRow[] }) {
  const totalPrincipal = rows.reduce((a, r) => a + r.principal, 0);
  const totalInterest = rows.reduce((a, r) => a + r.accruedInterest, 0);
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      searchable={(r) => `${r.certificateNumber} ${r.holderName}`}
      searchPlaceholder="Search convertibles…"
      rowHref={(r) => `/app/${companyId}/securities/${r.id}`}
      emptyTitle="No outstanding convertibles"
      emptyDescription="Outstanding SAFEs and convertible notes appear here until they convert in a priced round."
      toolbar={
        <Link href={`/app/${companyId}/modeling`} className="text-xs text-accent-foreground hover:underline">
          Model conversion →
        </Link>
      }
      columns={[
        { key: "cert", header: "Instrument", cell: (r) => <span className="font-mono text-xs">{r.certificateNumber}</span>, sortValue: (r) => r.certificateNumber },
        {
          key: "holder",
          header: "Holder",
          cell: (r) => (
            <Link href={`/app/${companyId}/stakeholders/${r.holderId}`} className="hover:underline" data-no-row>
              {r.holderName}
            </Link>
          ),
          sortValue: (r) => r.holderName,
        },
        {
          key: "type",
          header: "Type",
          cell: (r) => (
            <Badge variant={r.type === "SAFE" ? "accent" : "purple"}>
              {r.type === "SAFE" ? `${r.safeType === "PRE_MONEY" ? "Pre-money" : "Post-money"} SAFE` : "Convertible note"}
            </Badge>
          ),
          sortValue: (r) => r.type,
        },
        { key: "principal", header: "Principal", align: "right", cell: (r) => money(r.principal), sortValue: (r) => r.principal },
        { key: "cap", header: "Valuation cap", align: "right", cell: (r) => (r.valuationCap ? compactMoney(r.valuationCap) : <span className="text-subtle">Uncapped</span>), sortValue: (r) => r.valuationCap },
        { key: "discount", header: "Discount", align: "right", cell: (r) => (r.discountPercent ? `${r.discountPercent}%` : <span className="text-subtle">—</span>), sortValue: (r) => r.discountPercent },
        {
          key: "terms",
          header: "Terms",
          cell: (r) => (
            <span className="flex gap-1">
              {r.mfn ? <Badge variant="neutral">MFN</Badge> : null}
              {r.proRataRight ? <Badge variant="neutral">Pro rata</Badge> : null}
              {r.interestRate ? <Badge variant="neutral">{r.interestRate}% interest</Badge> : null}
            </span>
          ),
        },
        { key: "interest", header: "Accrued interest", align: "right", cell: (r) => (r.accruedInterest ? money(r.accruedInterest, { cents: true }) : <span className="text-subtle">—</span>), sortValue: (r) => r.accruedInterest },
        { key: "maturity", header: "Maturity", cell: (r) => (r.maturityDate ? date(r.maturityDate) : <span className="text-subtle">—</span>), sortValue: (r) => r.maturityDate },
        { key: "issued", header: "Issued", cell: (r) => date(r.issueDate), sortValue: (r) => r.issueDate },
      ]}
      footer={
        rows.length ? (
          <tr>
            <td colSpan={3}>Total</td>
            <td className="num">{money(totalPrincipal)}</td>
            <td colSpan={3} />
            <td className="num">{money(totalInterest, { cents: true })}</td>
            <td colSpan={2} />
          </tr>
        ) : null
      }
    />
  );
}
