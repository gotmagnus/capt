import type { BadgeProps } from "@/components/ui/badge";

/**
 * Badge colour per ledger transaction type. Lives outside the "use client" table module so
 * server components (e.g. the dashboard's recent activity) render types the same way.
 */
export const TRANSACTION_TYPE_VARIANT: Record<string, BadgeProps["variant"]> = {
  ISSUANCE: "success",
  EXERCISE: "accent",
  CANCELLATION: "danger",
  TRANSFER: "info",
  REPURCHASE: "danger",
  CONVERSION: "purple",
  STOCK_SPLIT: "warning",
  ACCELERATION: "info",
  MODIFICATION: "neutral",
  TERMINATION: "neutral",
  REPRICING: "warning",
};
