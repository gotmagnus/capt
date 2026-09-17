"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/page";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  className?: string;
  width?: string | number;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  searchable?: (row: T) => string;
  searchPlaceholder?: string;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  emptyAction?: React.ReactNode;
  toolbar?: React.ReactNode;
  footer?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string | undefined;
  dense?: boolean;
  className?: string;
  filters?: React.ReactNode;
  pageSize?: number;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchable,
  searchPlaceholder = "Search…",
  defaultSort,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  toolbar,
  footer,
  onRowClick,
  rowHref,
  dense,
  className,
  filters,
  pageSize = 50,
}: DataTableProps<T>) {
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState(defaultSort ?? null);
  const [page, setPage] = React.useState(0);

  const filtered = React.useMemo(() => {
    const ql = q.trim().toLowerCase();
    let out = ql && searchable ? rows.filter((r) => searchable(r).toLowerCase().includes(ql)) : rows.slice();
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) {
        const sv = col.sortValue;
        out = out.sort((a, b) => {
          const va = sv(a);
          const vb = sv(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, q, sort, columns, searchable]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));
    setPage(0);
  };

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      {searchable || toolbar || filters ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          {searchable ? (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="h-8 pl-8"
              />
            </div>
          ) : null}
          {filters}
          {toolbar ? <div className="ml-auto flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription ?? (q ? "Try a different search." : undefined)} action={q ? undefined : emptyAction} className="border-0 rounded-none" />
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className={cn("data-table", dense && "[&_td]:py-1.5")}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={cn(c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)} style={c.width ? { width: c.width } : undefined}>
                    {c.sortValue ? (
                      <button onClick={() => toggleSort(c.key)} className={cn("inline-flex items-center gap-1 hover:text-foreground", c.align === "right" && "flex-row-reverse")}>
                        {c.header}
                        {sort?.key === c.key ? sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const href = rowHref?.(r);
                return (
                  <tr
                    key={rowKey(r)}
                    className={cn((onRowClick || href) && "cursor-pointer")}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a,button,input,select,[data-no-row]")) return;
                      if (href) window.location.assign(href);
                      else onRowClick?.(r);
                    }}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn(c.align === "right" && "num", c.align === "center" && "text-center", c.className)}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            {footer ? <tfoot>{footer}</tfoot> : null}
          </table>
        </div>
      )}
      {pages > 1 ? (
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span>
            {currentPage * pageSize + 1}–{Math.min(filtered.length, (currentPage + 1) * pageSize)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded border border-border px-2 py-1 disabled:opacity-40 hover:bg-muted">
              Previous
            </button>
            <button disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)} className="rounded border border-border px-2 py-1 disabled:opacity-40 hover:bg-muted">
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function FilterSelect({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30" aria-label={label}>
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
