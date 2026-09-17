import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumbs?.length ? (
        <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <ChevronRight className="size-3" /> : null}
              {b.href ? (
                <Link href={b.href} className="hover:text-foreground">
                  {b.label}
                </Link>
              ) : (
                <span>{b.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 text-[13px] text-muted-foreground max-w-2xl">{description}</p> : null}
        </div>
        {actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  delta,
  icon: Icon,
  tone,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: { value: string; positive?: boolean };
  icon?: LucideIcon;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon ? <Icon className="size-4 text-subtle" /> : null}
      </div>
      <div className={cn("mt-1.5 text-[22px] font-semibold tracking-tight tabular leading-none", tone === "success" && "text-success", tone === "warning" && "text-warning", tone === "danger" && "text-danger", tone === "accent" && "text-accent-foreground")}>{value}</div>
      {hint || delta ? (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          {delta ? <span className={cn("font-medium", delta.positive === false ? "text-danger" : "text-success")}>{delta.value}</span> : null}
          {hint ? <span>{hint}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-card px-6 py-12 text-center", className)}>
      {Icon ? (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
          <Icon className="size-5 text-muted-foreground" />
        </div>
      ) : null}
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Section({ title, description, actions, children, className }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      {title ? (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
            {description ? <p className="text-[13px] text-muted-foreground">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Alert({ tone = "info", title, children, icon: Icon, className }: { tone?: "info" | "success" | "warning" | "danger"; title?: React.ReactNode; children?: React.ReactNode; icon?: LucideIcon; className?: string }) {
  const styles = {
    info: "bg-info-soft border-blue-200 text-info",
    success: "bg-success-soft border-emerald-200 text-success",
    warning: "bg-warning-soft border-amber-200 text-warning",
    danger: "bg-danger-soft border-red-200 text-danger",
  }[tone];
  return (
    <div className={cn("flex gap-3 rounded-md border px-4 py-3 text-[13px]", styles, className)}>
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0" /> : null}
      <div className="min-w-0">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div> : null}
      </div>
    </div>
  );
}

export function DescriptionList({ items, columns = 2, className }: { items: { label: React.ReactNode; value: React.ReactNode }[]; columns?: 1 | 2 | 3 | 4; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", columns === 1 && "grid-cols-1", columns === 2 && "grid-cols-2", columns === 3 && "grid-cols-2 sm:grid-cols-3", columns === 4 && "grid-cols-2 md:grid-cols-4", className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 truncate text-[13px] font-medium" title={typeof it.value === "string" ? it.value : undefined}>
            {it.value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function TableWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto rounded-lg border border-border bg-card scrollbar-thin", className)}>{children}</div>;
}
