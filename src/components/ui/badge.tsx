import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/types";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap", {
  variants: {
    variant: {
      default: "border-border bg-muted text-foreground",
      neutral: "border-transparent bg-muted text-muted-foreground",
      success: "border-transparent bg-success-soft text-success",
      warning: "border-transparent bg-warning-soft text-warning",
      danger: "border-transparent bg-danger-soft text-danger",
      info: "border-transparent bg-info-soft text-info",
      accent: "border-transparent bg-accent-soft text-accent-foreground",
      purple: "border-transparent bg-violet-50 text-violet-700",
      outline: "border-border-strong bg-transparent text-foreground",
      dark: "border-transparent bg-primary text-primary-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}

const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  OUTSTANDING: "success",
  ACTIVE: "success",
  ACCEPTED: "success",
  APPROVED: "success",
  SIGNED: "success",
  COMPLETED: "success",
  CONNECTED: "success",
  FILED: "success",
  PUBLISHED: "success",
  CLOSED: "success",
  SETTLED: "success",
  PAID: "success",
  DONE: "success",
  CURRENT: "success",
  OK: "success",
  PENDING_SIGNATURE: "warning",
  PENDING: "warning",
  REQUESTED: "warning",
  IN_PROGRESS: "info",
  DRAFT_DELIVERED: "info",
  SENT: "info",
  OPEN: "info",
  VIEWED: "info",
  PAYMENT_PENDING: "warning",
  WARNING: "warning",
  EXPIRING: "warning",
  DUE: "warning",
  PLANNED: "neutral",
  DRAFT: "neutral",
  NOT_REQUIRED: "neutral",
  DISCONNECTED: "neutral",
  WAIVED: "neutral",
  DISMISSED: "neutral",
  SUPERSEDED: "neutral",
  EXERCISED: "accent",
  CONVERTED: "accent",
  TRANSFERRED: "accent",
  GENERATED: "accent",
  PARTIALLY_SIGNED: "accent",
  CANCELLED: "danger",
  REJECTED: "danger",
  DECLINED: "danger",
  EXPIRED: "danger",
  FORFEITED: "danger",
  REPURCHASED: "danger",
  TERMINATED: "danger",
  ERROR: "danger",
  EXCEEDED: "danger",
  OVERDUE: "danger",
  MISSED: "danger",
  WITHDRAWN: "neutral",
  MISSING: "danger",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "default"} className={className} dot>
      {STATUS_LABELS[status] ?? status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </Badge>
  );
}

export { Badge, badgeVariants };
