import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "REQUESTED", label: "Requested" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "DRAFT_DELIVERED", label: "Draft delivered" },
  { key: "ACCEPTED", label: "Accepted" },
];

export function ValuationTimeline({ status, compact = false, dates }: { status: string; compact?: boolean; dates?: Partial<Record<string, string | null>> }) {
  const terminal = status === "EXPIRED" || status === "SUPERSEDED";
  const idx = terminal ? STEPS.length - 1 : STEPS.findIndex((s) => s.key === status);
  return (
    <ol className={cn("flex", compact ? "flex-col gap-2" : "items-start gap-0")}>
      {STEPS.map((s, i) => {
        const done = i < idx || (i === idx && (status === "ACCEPTED" || terminal));
        const active = i === idx && !done;
        return (
          <li key={s.key} className={cn("flex", compact ? "items-center gap-2" : "min-w-0 flex-1 flex-col items-start sm:last:flex-none")}>
            <div className={cn("flex items-center", compact ? "" : "w-full")}>
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", done ? "bg-success text-white" : active ? "bg-primary text-white ring-4 ring-primary/15" : "bg-muted text-muted-foreground")}>{done ? <Check className="size-3.5" /> : i + 1}</span>
              {!compact && i < STEPS.length - 1 ? <span className={cn("mx-2 h-px flex-1", i < idx ? "bg-success" : "bg-border")} /> : null}
            </div>
            <div className={cn(compact ? "" : "mt-2 pr-2")}>
              <div className={cn("text-[13px]", active || done ? "font-medium" : "text-muted-foreground")}>{terminal && i === STEPS.length - 1 ? (status === "EXPIRED" ? "Expired / withdrawn" : "Superseded") : s.label}</div>
              {dates?.[s.key] ? <div className="text-[11px] text-muted-foreground">{dates[s.key]}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
