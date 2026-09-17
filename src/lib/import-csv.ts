/**
 * Cap table CSV import: tolerant parser + row validation. Pure functions so they can be
 * unit-tested; the server action resolves names against the company's classes/plans/schedules.
 */

import { SECURITY_TYPES, STAKEHOLDER_RELATIONSHIPS } from "@/lib/types";

export const IMPORT_COLUMNS = [
  { key: "holderName", header: "Holder name", required: true, example: "Ada Lovelace" },
  { key: "email", header: "Email", required: false, example: "ada@company.com" },
  { key: "relationship", header: "Relationship", required: false, example: "EMPLOYEE" },
  { key: "securityType", header: "Security type", required: true, example: "OPTION_ISO" },
  { key: "classOrPlan", header: "Share class or plan", required: false, example: "2022 Equity Incentive Plan" },
  { key: "quantity", header: "Quantity", required: true, example: "10000" },
  { key: "price", header: "Price or strike", required: false, example: "0.85" },
  { key: "issueDate", header: "Issue date", required: true, example: "2026-01-15" },
  { key: "vestingSchedule", header: "Vesting schedule", required: false, example: "4 years, 1 year cliff, monthly" },
  { key: "vestingStart", header: "Vesting start", required: false, example: "2026-01-15" },
] as const;

export type ImportKey = (typeof IMPORT_COLUMNS)[number]["key"];

export interface RawImportRow {
  line: number;
  values: Record<ImportKey, string>;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const HEADER_ALIASES: Record<ImportKey, string[]> = {
  holderName: ["holder name", "holder", "name", "stakeholder", "stakeholder name"],
  email: ["email", "e-mail", "holder email"],
  relationship: ["relationship", "type of holder", "role"],
  securityType: ["security type", "type", "security", "instrument"],
  classOrPlan: ["share class or plan", "share class", "class", "plan", "class/plan", "equity plan"],
  quantity: ["quantity", "shares", "units", "number of shares", "amount"],
  price: ["price or strike", "price", "strike", "exercise price", "price per share", "pps"],
  issueDate: ["issue date", "grant date", "date", "issued"],
  vestingSchedule: ["vesting schedule", "vesting", "schedule"],
  vestingStart: ["vesting start", "vesting commencement", "vesting start date", "vcd"],
};

export function mapHeaders(header: string[]): Partial<Record<ImportKey, number>> {
  const map: Partial<Record<ImportKey, number>> = {};
  header.forEach((h, i) => {
    const norm = h.trim().toLowerCase();
    for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [ImportKey, string[]][]) {
      if (map[key] === undefined && aliases.includes(norm)) map[key] = i;
    }
  });
  return map;
}

export function toRawRows(text: string): { rows: RawImportRow[]; missing: ImportKey[] } {
  const parsed = parseCsv(text);
  if (parsed.length === 0) return { rows: [], missing: IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key) };
  const map = mapHeaders(parsed[0]);
  const missing = IMPORT_COLUMNS.filter((c) => c.required && map[c.key] === undefined).map((c) => c.key);
  const rows: RawImportRow[] = parsed.slice(1).map((cells, i) => {
    const values = {} as Record<ImportKey, string>;
    for (const c of IMPORT_COLUMNS) {
      const idx = map[c.key];
      values[c.key] = idx === undefined ? "" : (cells[idx] ?? "").trim();
    }
    return { line: i + 2, values };
  });
  return { rows, missing };
}

const TYPE_ALIASES: Record<string, string> = {
  common: "COMMON_SHARES",
  "common stock": "COMMON_SHARES",
  "common shares": "COMMON_SHARES",
  preferred: "PREFERRED_SHARES",
  "preferred stock": "PREFERRED_SHARES",
  "preferred shares": "PREFERRED_SHARES",
  iso: "OPTION_ISO",
  "iso option": "OPTION_ISO",
  option: "OPTION_ISO",
  options: "OPTION_ISO",
  nso: "OPTION_NSO",
  nqso: "OPTION_NSO",
  rsu: "RSU",
  rsa: "RSA",
  "restricted stock": "RSA",
  warrant: "WARRANT",
  safe: "SAFE",
  note: "CONVERTIBLE_NOTE",
  "convertible note": "CONVERTIBLE_NOTE",
  "profits interest": "PROFITS_INTEREST",
};

export function normalizeSecurityType(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const upper = v.toUpperCase().replace(/[\s-]+/g, "_");
  if ((SECURITY_TYPES as readonly string[]).includes(upper)) return upper;
  return TYPE_ALIASES[v.toLowerCase()] ?? null;
}

export function normalizeRelationship(input: string): string {
  const v = input.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!v) return "OTHER";
  if ((STAKEHOLDER_RELATIONSHIPS as readonly string[]).includes(v)) return v;
  if (v === "BOARD" || v === "DIRECTOR") return "BOARD_MEMBER";
  if (v === "EX_EMPLOYEE" || v === "FORMER") return "FORMER_EMPLOYEE";
  return "OTHER";
}

export interface ImportContext {
  shareClasses: { id: string; name: string; type: string; prefix: string }[];
  equityPlans: { id: string; name: string; shareClassId: string }[];
  vestingSchedules: { id: string; name: string }[];
  stakeholders: { id: string; name: string; email: string | null }[];
}

export interface ValidatedImportRow {
  line: number;
  errors: string[];
  holderName: string;
  email: string | null;
  relationship: string;
  existingStakeholderId: string | null;
  securityType: string | null;
  shareClassId: string | null;
  equityPlanId: string | null;
  classOrPlanName: string;
  quantity: number;
  price: number | null;
  issueDate: Date | null;
  vestingScheduleId: string | null;
  vestingScheduleName: string;
  vestingStart: Date | null;
}

function parseDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseNumber(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const norm = (s: string) => s.trim().toLowerCase();

export function validateRows(rows: RawImportRow[], ctx: ImportContext): ValidatedImportRow[] {
  return rows.map((r) => {
    const v = r.values;
    const errors: string[] = [];
    const holderName = v.holderName;
    if (!holderName) errors.push("Holder name is required");
    const email = v.email || null;
    if (email && !/.+@.+\..+/.test(email)) errors.push("Email looks invalid");
    const existing = ctx.stakeholders.find((s) => (email && s.email && norm(s.email) === norm(email)) || norm(s.name) === norm(holderName)) ?? null;
    const securityType = normalizeSecurityType(v.securityType);
    if (!securityType) errors.push(`Unknown security type "${v.securityType}"`);
    const quantity = parseNumber(v.quantity);
    const isConvertible = securityType === "SAFE" || securityType === "CONVERTIBLE_NOTE";
    if (quantity === null || quantity <= 0) errors.push(isConvertible ? "Quantity must be the principal amount" : "Quantity must be a positive number");
    const price = parseNumber(v.price);
    if (v.price && price === null) errors.push("Price is not a number");
    const issueDate = parseDate(v.issueDate);
    if (!issueDate) errors.push("Issue date is required (YYYY-MM-DD)");
    let shareClassId: string | null = null;
    let equityPlanId: string | null = null;
    if (securityType && !isConvertible) {
      const name = norm(v.classOrPlan);
      const plan = name ? ctx.equityPlans.find((p) => norm(p.name) === name) : undefined;
      const cls = name ? ctx.shareClasses.find((c) => norm(c.name) === name || norm(c.prefix) === name) : undefined;
      const wantsPlan = ["OPTION_ISO", "OPTION_NSO", "RSU"].includes(securityType);
      if (wantsPlan) {
        const p = plan ?? (ctx.equityPlans.length === 1 ? ctx.equityPlans[0] : undefined);
        if (!p) errors.push(name ? `Equity plan "${v.classOrPlan}" not found` : "Equity plan is required for options and RSUs");
        else {
          equityPlanId = p.id;
          shareClassId = p.shareClassId;
        }
      } else {
        const c = cls ?? (securityType === "COMMON_SHARES" || securityType === "RSA" || securityType === "WARRANT" ? ctx.shareClasses.find((x) => x.type === "COMMON") : undefined);
        if (!c) errors.push(name ? `Share class "${v.classOrPlan}" not found` : "Share class is required for preferred stock");
        else shareClassId = c.id;
      }
    }
    let vestingScheduleId: string | null = null;
    if (v.vestingSchedule) {
      const s = ctx.vestingSchedules.find((x) => norm(x.name) === norm(v.vestingSchedule));
      if (!s) errors.push(`Vesting schedule "${v.vestingSchedule}" not found`);
      else vestingScheduleId = s.id;
    }
    const vestingStart = parseDate(v.vestingStart);
    if (v.vestingStart && !vestingStart) errors.push("Vesting start is not a valid date");
    return {
      line: r.line,
      errors,
      holderName,
      email,
      relationship: normalizeRelationship(v.relationship),
      existingStakeholderId: existing?.id ?? null,
      securityType,
      shareClassId,
      equityPlanId,
      classOrPlanName: v.classOrPlan,
      quantity: quantity ?? 0,
      price,
      issueDate,
      vestingScheduleId,
      vestingScheduleName: v.vestingSchedule,
      vestingStart: vestingStart ?? issueDate,
    };
  });
}

export function toCsvLine(cells: string[]) {
  return cells.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");
}

export function importTemplateCsv() {
  const header = toCsvLine(IMPORT_COLUMNS.map((c) => c.header));
  const example1 = toCsvLine(IMPORT_COLUMNS.map((c) => c.example));
  const example2 = toCsvLine(["Basecamp Ventures", "ops@basecamp.vc", "INVESTOR", "PREFERRED_SHARES", "Series A Preferred", "500000", "2.10", "2024-09-15", "", ""]);
  const example3 = toCsvLine(["Grace Hopper", "grace@company.com", "FOUNDER", "RSA", "Common Stock", "4000000", "0.0001", "2022-03-15", "4 years, no cliff, monthly", "2022-03-15"]);
  return [header, example1, example2, example3].join("\n");
}
