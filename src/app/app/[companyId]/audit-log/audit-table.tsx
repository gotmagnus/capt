"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DataTable, FilterSelect, type Column } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  before: string | null;
  after: string | null;
  user: string;
  email: string | null;
  createdAt: string;
  ipAddress: string | null;
}

const ACTION_VARIANT: Record<string, "success" | "warning" | "danger" | "info" | "accent" | "neutral"> = {
  CREATE: "success",
  ISSUE: "success",
  APPROVE: "success",
  SIGN: "accent",
  UPDATE: "info",
  TRANSFER: "info",
  EXERCISE: "accent",
  CANCEL: "danger",
  DELETE: "danger",
  EXPORT: "neutral",
  LOGIN: "neutral",
  INVITE: "info",
};

const phoneHidden = "max-sm:hidden";
/** "BOARD_CONSENT" / "BoardConsent" → "Board consent". */
const humanize = (s: string) => {
  const words = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function tryParse(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : { value: v };
  } catch {
    return { value: s };
  }
}

function Diff({ before, after }: { before: string | null; after: string | null }) {
  const b = tryParse(before);
  const a = tryParse(after);
  if (!b && !a) return <div className="text-xs text-muted-foreground">No field-level details recorded.</div>;
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])];
  return (
    <table className="text-xs [&_td]:whitespace-normal [&_td]:break-all [&_td]:border-0 [&_td]:p-0 [&_td]:pr-4 [&_td]:py-0.5 [&_th]:static [&_th]:border-0 [&_th]:bg-transparent [&_th]:p-0 [&_th]:pr-4">
      <thead>
        <tr className="text-muted-foreground">
          <th className="pr-4 text-left font-medium">Field</th>
          <th className="pr-4 text-left font-medium">Before</th>
          <th className="text-left font-medium">After</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => {
          const bv = b?.[k];
          const av = a?.[k];
          const changed = JSON.stringify(bv) !== JSON.stringify(av);
          return (
            <tr key={k}>
              <td className="pr-4 py-0.5 font-mono">{k}</td>
              <td className={cn("pr-4 py-0.5 font-mono", changed && bv !== undefined && "text-danger line-through")}>{bv === undefined ? "—" : JSON.stringify(bv)}</td>
              <td className={cn("py-0.5 font-mono", changed && av !== undefined && "text-success")}>{av === undefined ? "—" : JSON.stringify(av)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [user, setUser] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const actions = useMemo(() => [...new Set(rows.map((r) => r.action))].sort(), [rows]);
  const entities = useMemo(() => [...new Set(rows.map((r) => r.entityType))].sort(), [rows]);
  const users = useMemo(() => [...new Set(rows.map((r) => r.user))].sort(), [rows]);
  const filtered = rows.filter((r) => (!action || r.action === action) && (!entity || r.entityType === entity) && (!user || r.user === user) && (!from || r.createdAt >= new Date(from).toISOString()) && (!to || r.createdAt <= new Date(to + "T23:59:59").toISOString()));

  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  const columns: Column<AuditRow>[] = [
    { key: "exp", header: "", width: 28, className: "max-sm:pr-0 max-sm:align-top", cell: (r) => (r.before || r.after ? (open.has(r.id) ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />) : null) },
    { key: "createdAt", header: "When", className: phoneHidden, sortValue: (r) => r.createdAt, cell: (r) => <span className="text-muted-foreground whitespace-nowrap">{dateTime(r.createdAt)}</span> },
    { key: "action", header: "Action", className: phoneHidden, sortValue: (r) => r.action, cell: (r) => <Badge variant={ACTION_VARIANT[r.action] ?? "neutral"}>{humanize(r.action)}</Badge> },
    { key: "entity", header: "Entity", className: phoneHidden, sortValue: (r) => r.entityType, cell: (r) => <span className="text-xs">{humanize(r.entityType)}{r.entityId ? <span className="ml-1 font-mono text-[10px] text-muted-foreground">{r.entityId.slice(-6)}</span> : null}</span> },
    {
      key: "summary",
      header: "Summary",
      cell: (r) => (
        <div className="whitespace-normal sm:min-w-[18rem]">
          <div>{r.summary}</div>
          {/* Phones show one column: action, entity, actor and time fold under the summary. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:hidden">
            <Badge variant={ACTION_VARIANT[r.action] ?? "neutral"}>{humanize(r.action)}</Badge>
            <span>{humanize(r.entityType)}</span>
            <span>·</span>
            <span>{r.user}</span>
            <span className="basis-full">{dateTime(r.createdAt)}</span>
          </div>
          {open.has(r.id) ? (
            <div className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/40 p-3">
              <Diff before={r.before} after={r.after} />
            </div>
          ) : null}
        </div>
      ),
    },
    { key: "user", header: "Actor", className: phoneHidden, sortValue: (r) => r.user, cell: (r) => (<div><div>{r.user}</div>{r.email ? <div className="text-xs text-muted-foreground">{r.email}</div> : null}</div>) },
  ];

  return (
    <DataTable
      rows={filtered}
      columns={columns}
      rowKey={(r) => r.id}
      onRowClick={(r) => (r.before || r.after ? toggle(r.id) : undefined)}
      searchable={(r) => `${r.summary} ${r.action} ${r.entityType} ${r.user}`}
      searchPlaceholder="Search the log…"
      defaultSort={{ key: "createdAt", dir: "desc" }}
      emptyTitle="No matching entries"
      pageSize={100}
      filters={
        <>
          <FilterSelect label="Action" value={action} onChange={setAction} options={actions.map((a) => ({ value: a, label: humanize(a) }))} />
          <FilterSelect label="Entity" value={entity} onChange={setEntity} options={entities.map((e) => ({ value: e, label: humanize(e) }))} />
          <FilterSelect label="Actor" value={user} onChange={setUser} options={users.map((u) => ({ value: u, label: u }))} />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 text-xs" aria-label="From date" />
            <span aria-hidden>–</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 text-xs" aria-label="To date" />
          </div>
        </>
      }
      toolbar={<span className="text-xs text-muted-foreground">{filtered.length} entries</span>}
    />
  );
}
