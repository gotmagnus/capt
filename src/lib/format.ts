import { format as fmtDate, formatDistanceToNowStrict, differenceInDays } from "date-fns";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdPrecise = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const numDec = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function money(value: number | null | undefined, opts: { cents?: boolean; precise?: boolean } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (opts.precise) return usdPrecise.format(value);
  if (opts.cents) return usdCents.format(value);
  return Math.abs(value) < 1000 && value !== 0 ? usdCents.format(value) : usd.format(value);
}

/** Price-per-share style values: always shows cents, up to 4 decimals for sub-dollar prices. */
export function price(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return usdPrecise.format(value);
}

export function compactMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value === 0) return "$0";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`;
  return usdCents.format(value);
}

export function shares(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return num.format(Math.round(value));
}

export function number(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return numDec.format(value);
}

export function percent(value: number | null | undefined, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

/** value is already a percentage (e.g. 12.5) */
export function pct(value: number | null | undefined, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

export function multiple(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${numDec.format(value)}x`;
}

export function date(value: Date | string | null | undefined, style: "short" | "long" | "iso" = "short") {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  if (style === "iso") return fmtDate(d, "yyyy-MM-dd");
  if (style === "long") return fmtDate(d, "MMMM d, yyyy");
  return fmtDate(d, "MMM d, yyyy");
}

export function dateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return fmtDate(d, "MMM d, yyyy 'at' h:mm a");
}

export function relative(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function daysUntil(value: Date | string | null | undefined) {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return differenceInDays(d, new Date());
}

export function toInputDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return fmtDate(d, "yyyy-MM-dd");
}

export function humanize(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
