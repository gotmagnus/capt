import type { ExportColumn } from "@/lib/export";
import { date, money, number, percent, shares } from "@/lib/format";
import { StatusBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_KEYS = new Set(["status", "employmentStatus", "portal"]);
/** Enum-like columns the report builders lower-case for export ("former employee", "option exercise") — sentence-case them on screen. */
const SENTENCE_KEYS = new Set(["relationship", "type", "purpose", "action", "safeType", "frequency", "method"]);

// Phones: pin the identifying first column while the rest of a wide report scrolls sideways.
const STICKY_CELL = "max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:max-w-40 max-sm:truncate max-sm:border-r max-sm:border-border max-sm:bg-card";
const STICKY_HEAD = "max-sm:sticky max-sm:left-0 max-sm:z-[2] max-sm:border-r max-sm:border-border";

function formatCell(value: unknown, col: ExportColumn) {
  if (value === null || value === undefined || value === "") return <span className="text-subtle">—</span>;
  switch (col.type) {
    case "date":
      return date(value as Date | string);
    case "money":
      return money(Number(value), { precise: Math.abs(Number(value)) < 10 });
    case "percent":
      return percent(Number(value));
    case "shares":
      return shares(Number(value));
    case "number":
      return number(Number(value));
    default:
      if (col.key === "status" && typeof value === "string" && /^[A-Z_]+$/.test(value)) return <StatusBadge status={value} />;
      if (SENTENCE_KEYS.has(col.key) && typeof value === "string" && /^[a-z]/.test(value)) return value.charAt(0).toUpperCase() + value.slice(1);
      return String(value);
  }
}

export function ReportTable({ columns, rows, maxRows = 500 }: { columns: ExportColumn[]; rows: Record<string, unknown>[]; maxRows?: number }) {
  const visible = rows.slice(0, maxRows);
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card scrollbar-thin">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c, ci) => (
              <th key={c.key} className={cn(["money", "percent", "shares", "number"].includes(c.type ?? "") && "text-right", ci === 0 && columns.length > 3 && STICKY_HEAD)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                No rows for the selected parameters.
              </td>
            </tr>
          ) : null}
          {visible.map((r, i) => (
            <tr key={i}>
              {columns.map((c, ci) => (
                <td key={c.key} title={ci === 0 && typeof r[c.key] === "string" ? (r[c.key] as string) : undefined} className={cn(["money", "percent", "shares", "number"].includes(c.type ?? "") && "num", STATUS_KEYS.has(c.key) && "capitalize", ci === 0 && columns.length > 3 && STICKY_CELL)}>
                  {formatCell(r[c.key], c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows ? <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Showing the first {maxRows} of {rows.length} rows. Export to see everything.</div> : null}
    </div>
  );
}
