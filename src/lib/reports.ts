import "server-only";
import { addMonths, subMonths } from "date-fns";
import { db } from "@/lib/db";
import { loadCapTable, type CapTableData } from "@/lib/data/captable";
import { buildVestingEvents, computeVesting } from "@/lib/equity/vesting";
import { accruedInterest } from "@/lib/equity/conversion";
import { buildForm3921Records, rule701Check } from "@/lib/equity/compliance";
import type { ExportColumn } from "@/lib/export";
import { CONVERTIBLE_TYPES, EXERCISABLE_TYPES, OPTION_TYPES, SECURITY_TYPE_LABELS, SHARE_TYPES, type SecurityType } from "@/lib/types";

export type ReportGroup = "Cap table" | "Equity" | "People" | "Compliance" | "Activity";
export type ReportParamKind = "asOf" | "year" | "range";

export interface ReportParams {
  asOf: Date;
  year: number;
  from: Date;
  to: Date;
}

export interface ReportDef {
  id: string;
  name: string;
  description: string;
  group: ReportGroup;
  icon: "table" | "layers" | "badge" | "calendar" | "rocket" | "users" | "briefcase" | "chart" | "shield" | "file" | "history" | "list";
  params: ReportParamKind[];
  columns: ExportColumn[];
  build: (data: CapTableData, params: ReportParams) => Promise<Record<string, unknown>[]>;
}

const label = (t: string) => SECURITY_TYPE_LABELS[t as SecurityType] ?? t;

export const REPORTS: ReportDef[] = [
  {
    id: "cap-table-summary",
    name: "Cap table summary",
    description: "Ownership by stakeholder: outstanding and fully diluted shares and percentages.",
    group: "Cap table",
    icon: "table",
    params: ["asOf"],
    columns: [
      { key: "name", header: "Stakeholder", width: 34 },
      { key: "relationship", header: "Relationship" },
      { key: "commonShares", header: "Common", type: "shares" },
      { key: "preferredShares", header: "Preferred (as converted)", type: "shares" },
      { key: "optionsOutstanding", header: "Options", type: "shares" },
      { key: "rsus", header: "RSUs", type: "shares" },
      { key: "warrants", header: "Warrants", type: "shares" },
      { key: "outstandingShares", header: "Outstanding", type: "shares" },
      { key: "outstandingPct", header: "% Outstanding", type: "percent" },
      { key: "fullyDilutedShares", header: "Fully diluted", type: "shares" },
      { key: "fullyDilutedPct", header: "% Fully diluted", type: "percent" },
      { key: "invested", header: "Invested", type: "money" },
    ],
    build: async (data) => {
      const rows = data.summary.rows.map((r) => ({ ...r, relationship: r.relationship.replace(/_/g, " ").toLowerCase() }));
      const t = data.summary.totals;
      rows.push({
        stakeholderId: "pool",
        name: "Unallocated option pool",
        relationship: "pool",
        byClass: {},
        commonShares: 0,
        preferredShares: 0,
        optionsGranted: 0,
        optionsOutstanding: 0,
        optionsVested: 0,
        optionsExercisable: 0,
        rsus: 0,
        warrants: 0,
        safePrincipal: 0,
        notePrincipal: 0,
        invested: 0,
        outstandingShares: 0,
        outstandingPct: 0,
        fullyDilutedShares: t.poolAvailable,
        fullyDilutedPct: t.fullyDilutedShares ? t.poolAvailable / t.fullyDilutedShares : 0,
        votingPct: 0,
        securityIds: [],
      });
      return rows;
    },
  },
  {
    id: "fully-diluted",
    name: "Fully diluted detail",
    description: "Every outstanding security with its contribution to the fully diluted share count.",
    group: "Cap table",
    icon: "layers",
    params: ["asOf"],
    columns: [
      { key: "certificateNumber", header: "Certificate" },
      { key: "holder", header: "Holder", width: 34 },
      { key: "type", header: "Type" },
      { key: "className", header: "Class / plan", width: 28 },
      { key: "quantity", header: "Issued / granted", type: "shares" },
      { key: "exercised", header: "Exercised", type: "shares" },
      { key: "cancelled", header: "Cancelled", type: "shares" },
      { key: "fullyDiluted", header: "Fully diluted shares", type: "shares" },
      { key: "fdPct", header: "% Fully diluted", type: "percent" },
      { key: "issueDate", header: "Issue date", type: "date" },
      { key: "status", header: "Status" },
    ],
    build: async (data, p) => {
      const fd = data.summary.totals.fullyDilutedShares;
      const rows: Record<string, unknown>[] = [];
      for (const s of data.securities) {
        if (s.issueDate > p.asOf) continue;
        if (!["OUTSTANDING", "EXERCISED", "PENDING_SIGNATURE"].includes(s.status)) continue;
        let contribution = 0;
        if (SHARE_TYPES.includes(s.type as never)) contribution = (s.quantity - s.cancelledQuantity) * (s.shareClass?.type === "PREFERRED" ? s.shareClass.conversionRatio || 1 : 1);
        else if (EXERCISABLE_TYPES.includes(s.type as never) || s.type === "RSU") contribution = Math.max(0, s.quantity - s.exercisedQuantity - s.cancelledQuantity);
        else continue;
        if (contribution <= 0) continue;
        rows.push({
          certificateNumber: s.certificateNumber,
          holder: s.stakeholder.name,
          type: label(s.type),
          className: s.shareClass?.name ?? s.equityPlan?.name ?? "—",
          quantity: s.quantity,
          exercised: s.exercisedQuantity,
          cancelled: s.cancelledQuantity,
          fullyDiluted: contribution,
          fdPct: fd ? contribution / fd : 0,
          issueDate: s.issueDate,
          status: s.status,
        });
      }
      for (const plan of data.summary.plans) {
        rows.push({ certificateNumber: "—", holder: "Unallocated pool", type: "Pool", className: plan.name, quantity: plan.authorized, exercised: plan.exercised, cancelled: plan.cancelled, fullyDiluted: plan.available, fdPct: fd ? plan.available / fd : 0, issueDate: null, status: "AVAILABLE" });
      }
      return rows;
    },
  },
  {
    id: "by-share-class",
    name: "Share classes",
    description: "Authorized, issued and available shares per class with liquidation preferences.",
    group: "Cap table",
    icon: "layers",
    params: ["asOf"],
    columns: [
      { key: "name", header: "Class", width: 30 },
      { key: "type", header: "Type" },
      { key: "authorized", header: "Authorized", type: "shares" },
      { key: "issued", header: "Issued", type: "shares" },
      { key: "asConverted", header: "As converted", type: "shares" },
      { key: "reservedForPlans", header: "Reserved for plans", type: "shares" },
      { key: "available", header: "Available", type: "shares" },
      { key: "outstandingPct", header: "% Outstanding", type: "percent" },
      { key: "fullyDilutedPct", header: "% Fully diluted", type: "percent" },
      { key: "liquidationPreference", header: "Liquidation preference", type: "money" },
    ],
    build: async (data) => data.summary.classTotals.map((c) => ({ ...c })),
  },
  {
    id: "securities-ledger",
    name: "Securities ledger",
    description: "Complete list of every security ever issued, including cancelled and converted instruments.",
    group: "Equity",
    icon: "badge",
    params: [],
    columns: [
      { key: "certificateNumber", header: "Certificate" },
      { key: "holder", header: "Holder", width: 34 },
      { key: "type", header: "Type" },
      { key: "className", header: "Class / plan", width: 28 },
      { key: "quantity", header: "Quantity", type: "shares" },
      { key: "price", header: "Price / strike", type: "money" },
      { key: "totalAmount", header: "Consideration", type: "money" },
      { key: "exercised", header: "Exercised", type: "shares" },
      { key: "cancelled", header: "Cancelled", type: "shares" },
      { key: "issueDate", header: "Issue date", type: "date" },
      { key: "vestingSchedule", header: "Vesting", width: 30 },
      { key: "status", header: "Status" },
    ],
    build: async (data) =>
      data.securities.map((s) => ({
        certificateNumber: s.certificateNumber,
        holder: s.stakeholder.name,
        type: label(s.type),
        className: s.shareClass?.name ?? s.equityPlan?.name ?? "—",
        quantity: s.quantity,
        price: s.exercisePrice ?? s.pricePerShare ?? null,
        totalAmount: s.totalAmount ?? null,
        exercised: s.exercisedQuantity,
        cancelled: s.cancelledQuantity,
        issueDate: s.issueDate,
        vestingSchedule: s.vestingSchedule?.name ?? "—",
        status: s.status,
      })),
  },
  {
    id: "option-ledger",
    name: "Option ledger",
    description: "Options and warrants with vesting status, exercisable amounts and expiration dates.",
    group: "Equity",
    icon: "badge",
    params: ["asOf"],
    columns: [
      { key: "certificateNumber", header: "Grant" },
      { key: "holder", header: "Holder", width: 30 },
      { key: "type", header: "Type" },
      { key: "plan", header: "Plan", width: 28 },
      { key: "granted", header: "Granted", type: "shares" },
      { key: "exercised", header: "Exercised", type: "shares" },
      { key: "cancelled", header: "Cancelled", type: "shares" },
      { key: "outstanding", header: "Outstanding", type: "shares" },
      { key: "vested", header: "Vested", type: "shares" },
      { key: "unvested", header: "Unvested", type: "shares" },
      { key: "exercisable", header: "Exercisable", type: "shares" },
      { key: "strike", header: "Strike", type: "money" },
      { key: "grantDate", header: "Grant date", type: "date" },
      { key: "vestingStart", header: "Vesting start", type: "date" },
      { key: "cliffDate", header: "Cliff", type: "date" },
      { key: "fullyVested", header: "Fully vested", type: "date" },
      { key: "expiration", header: "Expiration", type: "date" },
      { key: "status", header: "Status" },
    ],
    build: async (data, p) =>
      data.securities
        .filter((s) => EXERCISABLE_TYPES.includes(s.type as never) && s.issueDate <= p.asOf)
        .map((s) => {
          const v = computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, s.vestingScheduleId ? data.schedules[s.vestingScheduleId] : null, { asOf: p.asOf, terminationDate: s.stakeholder.terminationDate, cancelled: s.cancelledQuantity });
          const outstanding = Math.max(0, s.quantity - s.exercisedQuantity - s.cancelledQuantity);
          return {
            certificateNumber: s.certificateNumber,
            holder: s.stakeholder.name,
            type: label(s.type),
            plan: s.equityPlan?.name ?? "—",
            granted: s.quantity,
            exercised: s.exercisedQuantity,
            cancelled: s.cancelledQuantity,
            outstanding,
            vested: v.vested,
            unvested: v.unvested,
            exercisable: Math.max(0, Math.min(outstanding, v.vested - s.exercisedQuantity)),
            strike: s.exercisePrice,
            grantDate: s.grantDate ?? s.issueDate,
            vestingStart: s.vestingStartDate,
            cliffDate: v.cliffDate,
            fullyVested: v.fullyVestedDate,
            expiration: s.expirationDate,
            status: s.status,
          };
        }),
  },
  {
    id: "vesting-schedule",
    name: "Vesting schedule (next 12 months)",
    description: "Every vesting event in the twelve months following the as-of date, per grant.",
    group: "Equity",
    icon: "calendar",
    params: ["asOf"],
    columns: [
      { key: "date", header: "Vest date", type: "date" },
      { key: "certificateNumber", header: "Grant" },
      { key: "holder", header: "Holder", width: 30 },
      { key: "type", header: "Type" },
      { key: "amount", header: "Shares vesting", type: "shares" },
      { key: "cumulative", header: "Cumulative vested", type: "shares" },
      { key: "total", header: "Grant size", type: "shares" },
      { key: "label", header: "Note" },
    ],
    build: async (data, p) => {
      const end = addMonths(p.asOf, 12);
      const rows: Record<string, unknown>[] = [];
      for (const s of data.securities) {
        if (!["OPTION_ISO", "OPTION_NSO", "RSU", "RSA"].includes(s.type) || s.status !== "OUTSTANDING" || !s.vestingScheduleId) continue;
        if (s.stakeholder.terminationDate && s.stakeholder.terminationDate <= p.asOf) continue;
        const qty = s.quantity - s.cancelledQuantity;
        for (const e of buildVestingEvents(qty, s.vestingStartDate ?? s.issueDate, data.schedules[s.vestingScheduleId])) {
          if (e.date <= p.asOf || e.date > end) continue;
          rows.push({ date: e.date, certificateNumber: s.certificateNumber, holder: s.stakeholder.name, type: label(s.type), amount: e.amount, cumulative: e.cumulative, total: qty, label: e.label ?? "" });
        }
      }
      return rows.sort((a, b) => (a.date as Date).getTime() - (b.date as Date).getTime());
    },
  },
  {
    id: "convertibles",
    name: "Convertibles",
    description: "SAFEs and convertible notes with caps, discounts, interest and conversion status.",
    group: "Equity",
    icon: "rocket",
    params: ["asOf"],
    columns: [
      { key: "certificateNumber", header: "Instrument" },
      { key: "holder", header: "Holder", width: 34 },
      { key: "type", header: "Type" },
      { key: "principal", header: "Principal", type: "money" },
      { key: "valuationCap", header: "Valuation cap", type: "money" },
      { key: "discountPercent", header: "Discount %", type: "number" },
      { key: "safeType", header: "SAFE type" },
      { key: "interestRate", header: "Interest %", type: "number" },
      { key: "accruedInterest", header: "Accrued interest", type: "money" },
      { key: "maturityDate", header: "Maturity", type: "date" },
      { key: "mfn", header: "MFN" },
      { key: "proRata", header: "Pro rata" },
      { key: "issueDate", header: "Issue date", type: "date" },
      { key: "status", header: "Status" },
    ],
    build: async (data, p) =>
      data.securities
        .filter((s) => CONVERTIBLE_TYPES.includes(s.type as never))
        .map((s) => ({
          certificateNumber: s.certificateNumber,
          holder: s.stakeholder.name,
          type: label(s.type),
          principal: s.totalAmount ?? 0,
          valuationCap: s.valuationCap,
          discountPercent: s.discountPercent,
          safeType: s.safeType ? s.safeType.replace("_", "-").toLowerCase() : "—",
          interestRate: s.interestRate,
          accruedInterest: s.status === "OUTSTANDING" ? accruedInterest({ id: s.id, type: s.type, stakeholderId: s.stakeholderId, principal: s.totalAmount ?? 0, interestRate: s.interestRate, interestType: s.interestType, issueDate: s.issueDate }, p.asOf) : 0,
          maturityDate: s.maturityDate,
          mfn: s.mfn ? "Yes" : "No",
          proRata: s.proRataRight ? "Yes" : "No",
          issueDate: s.issueDate,
          status: s.status,
        })),
  },
  {
    id: "stakeholders",
    name: "Stakeholder directory",
    description: "Contact and relationship details for every stakeholder with their fully diluted ownership.",
    group: "People",
    icon: "users",
    params: ["asOf"],
    columns: [
      { key: "name", header: "Name", width: 34 },
      { key: "email", header: "Email", width: 30 },
      { key: "type", header: "Type" },
      { key: "relationship", header: "Relationship" },
      { key: "title", header: "Title", width: 26 },
      { key: "department", header: "Department" },
      { key: "employmentStatus", header: "Employment" },
      { key: "startDate", header: "Start date", type: "date" },
      { key: "terminationDate", header: "Termination date", type: "date" },
      { key: "country", header: "Country" },
      { key: "portal", header: "Portal" },
      { key: "fullyDilutedShares", header: "Fully diluted", type: "shares" },
      { key: "fullyDilutedPct", header: "% Fully diluted", type: "percent" },
    ],
    build: async (data) => {
      const byId = new Map(data.summary.rows.map((r) => [r.stakeholderId, r]));
      return data.stakeholders.map((s) => {
        const r = byId.get(s.id);
        return {
          name: s.name,
          email: s.email ?? "",
          type: s.type.toLowerCase(),
          relationship: s.relationship.replace(/_/g, " ").toLowerCase(),
          title: s.title ?? "",
          department: s.department ?? "",
          employmentStatus: s.employmentStatus ?? "",
          startDate: s.startDate,
          terminationDate: s.terminationDate,
          country: s.country,
          portal: s.portalAcceptedAt ? "Active" : s.portalInvitedAt ? "Invited" : "Not invited",
          fullyDilutedShares: r?.fullyDilutedShares ?? 0,
          fullyDilutedPct: r?.fullyDilutedPct ?? 0,
        };
      });
    },
  },
  {
    id: "employee-equity",
    name: "Employee equity summary",
    description: "Per-employee grant totals, vesting progress and exercisable options.",
    group: "People",
    icon: "briefcase",
    params: ["asOf"],
    columns: [
      { key: "name", header: "Employee", width: 30 },
      { key: "title", header: "Title", width: 26 },
      { key: "department", header: "Department" },
      { key: "startDate", header: "Start date", type: "date" },
      { key: "employmentStatus", header: "Status" },
      { key: "grants", header: "Grants", type: "number" },
      { key: "granted", header: "Granted", type: "shares" },
      { key: "vested", header: "Vested", type: "shares" },
      { key: "unvested", header: "Unvested", type: "shares" },
      { key: "exercised", header: "Exercised", type: "shares" },
      { key: "exercisable", header: "Exercisable", type: "shares" },
      { key: "cancelled", header: "Cancelled / forfeited", type: "shares" },
      { key: "avgStrike", header: "Avg strike", type: "money" },
      { key: "nextVestDate", header: "Next vest", type: "date" },
      { key: "nextVestAmount", header: "Next vest shares", type: "shares" },
    ],
    build: async (data, p) => {
      const employees = data.stakeholders.filter((s) => ["EMPLOYEE", "FORMER_EMPLOYEE", "FOUNDER"].includes(s.relationship));
      return employees.map((e) => {
        const grants = data.securities.filter((s) => s.stakeholderId === e.id && ["OPTION_ISO", "OPTION_NSO", "RSU", "RSA"].includes(s.type) && s.issueDate <= p.asOf);
        let granted = 0, vested = 0, unvested = 0, exercised = 0, exercisable = 0, cancelled = 0, strikeWeight = 0, strikeShares = 0;
        let nextVestDate: Date | null = null;
        let nextVestAmount = 0;
        for (const s of grants) {
          const v = computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, s.vestingScheduleId ? data.schedules[s.vestingScheduleId] : null, { asOf: p.asOf, terminationDate: e.terminationDate, cancelled: s.cancelledQuantity });
          granted += s.quantity;
          vested += v.vested;
          unvested += v.unvested;
          exercised += s.exercisedQuantity;
          cancelled += s.cancelledQuantity + v.forfeited;
          if (OPTION_TYPES.includes(s.type as never)) {
            const outstanding = Math.max(0, s.quantity - s.exercisedQuantity - s.cancelledQuantity);
            exercisable += Math.max(0, Math.min(outstanding, v.vested - s.exercisedQuantity));
            strikeWeight += (s.exercisePrice ?? 0) * s.quantity;
            strikeShares += s.quantity;
          }
          if (v.nextVestDate && (!nextVestDate || v.nextVestDate < nextVestDate)) {
            nextVestDate = v.nextVestDate;
            nextVestAmount = v.nextVestAmount;
          }
        }
        return { name: e.name, title: e.title ?? "", department: e.department ?? "", startDate: e.startDate, employmentStatus: e.employmentStatus ?? "", grants: grants.length, granted, vested, unvested, exercised, exercisable, cancelled, avgStrike: strikeShares ? strikeWeight / strikeShares : null, nextVestDate, nextVestAmount };
      });
    },
  },
  {
    id: "valuations",
    name: "409A valuation history",
    description: "Every valuation with fair market value, methodology and acceptance dates.",
    group: "Compliance",
    icon: "chart",
    params: [],
    columns: [
      { key: "valuationDate", header: "Valuation date", type: "date" },
      { key: "fairMarketValue", header: "Common FMV", type: "money" },
      { key: "preferredPrice", header: "Preferred price", type: "money" },
      { key: "enterpriseValue", header: "Enterprise value", type: "money" },
      { key: "equityValue", header: "Equity value", type: "money" },
      { key: "methodology", header: "Methodology" },
      { key: "dlomPercent", header: "DLOM %", type: "number" },
      { key: "volatility", header: "Volatility", type: "percent" },
      { key: "purpose", header: "Purpose" },
      { key: "provider", header: "Provider", width: 24 },
      { key: "status", header: "Status" },
      { key: "acceptedAt", header: "Accepted", type: "date" },
      { key: "effectiveTo", header: "Expires", type: "date" },
    ],
    build: async (data) => {
      const vals = await db.valuation.findMany({ where: { companyId: data.company.id }, orderBy: { valuationDate: "desc" } });
      return vals.map((v) => ({ ...v, methodology: v.methodology ?? "", purpose: v.purpose.toLowerCase() }));
    },
  },
  {
    id: "rule-701",
    name: "Rule 701 sales (trailing 12 months)",
    description: "Compensatory issuances counted toward the Rule 701 limit in the twelve months before the as-of date.",
    group: "Compliance",
    icon: "shield",
    params: ["asOf"],
    columns: [
      { key: "date", header: "Date", type: "date" },
      { key: "stakeholderName", header: "Holder", width: 30 },
      { key: "certificateNumber", header: "Security" },
      { key: "type", header: "Type" },
      { key: "quantity", header: "Shares", type: "shares" },
      { key: "aggregateSalesPrice", header: "Aggregate sales price", type: "money" },
      { key: "limit", header: "Applicable limit", type: "money" },
      { key: "runningTotal", header: "Running total", type: "money" },
    ],
    build: async (data, p) => {
      const sales = data.securities
        .filter((s) => ["OPTION_ISO", "OPTION_NSO", "RSU", "RSA"].includes(s.type))
        .map((s) => ({ securityId: s.id, stakeholderName: s.stakeholder.name, type: s.type, date: s.grantDate ?? s.issueDate, quantity: s.quantity, aggregateSalesPrice: s.quantity * (OPTION_TYPES.includes(s.type as never) ? s.exercisePrice ?? 0 : s.fmvAtGrant ?? s.pricePerShare ?? 0) }));
      const fmv = (await db.valuation.findFirst({ where: { companyId: data.company.id, status: "ACCEPTED" }, orderBy: { valuationDate: "desc" } }))?.fairMarketValue ?? null;
      const r = rule701Check({ sales, asOf: p.asOf, totalAssets: data.company.totalAssets, outstandingSharesValue: fmv ? fmv * data.summary.totals.outstandingShares : null });
      const certs = new Map(data.securities.map((s) => [s.id, s.certificateNumber]));
      let running = 0;
      return r.sales
        .slice()
        .reverse()
        .map((s) => {
          running += s.aggregateSalesPrice;
          return { date: s.date, stakeholderName: s.stakeholderName, certificateNumber: certs.get(s.securityId) ?? "", type: label(s.type), quantity: s.quantity, aggregateSalesPrice: s.aggregateSalesPrice, limit: r.applicableLimit, runningTotal: running };
        });
    },
  },
  {
    id: "form-3921",
    name: "Form 3921 data",
    description: "ISO exercises in the selected tax year with the values required on Form 3921.",
    group: "Compliance",
    icon: "file",
    params: ["year"],
    columns: [
      { key: "employeeName", header: "Employee", width: 30 },
      { key: "employeeTin", header: "TIN" },
      { key: "grantDate", header: "Grant date (Box 1)", type: "date" },
      { key: "exerciseDate", header: "Exercise date (Box 2)", type: "date" },
      { key: "exercisePricePerShare", header: "Exercise price (Box 3)", type: "money" },
      { key: "fmvPerShareOnExercise", header: "FMV at exercise (Box 4)", type: "money" },
      { key: "sharesTransferred", header: "Shares (Box 5)", type: "shares" },
      { key: "spread", header: "Spread", type: "money" },
      { key: "copyBDueDate", header: "Copy B due", type: "date" },
      { key: "copyADueDate", header: "Copy A due", type: "date" },
    ],
    build: async (data, p) => {
      const ex = await db.exerciseRequest.findMany({ where: { companyId: data.company.id, status: "COMPLETED", isIso: true }, include: { stakeholder: true, security: true } });
      return buildForm3921Records(
        ex.map((e) => ({ id: e.id, employeeName: e.stakeholder.name, address: e.stakeholder.address, tin: e.stakeholder.taxId ? `***-**-${e.stakeholder.taxId.slice(-4)}` : null, grantDate: e.security.grantDate ?? e.security.issueDate, exerciseDate: e.completedAt ?? e.requestedAt, exercisePrice: e.exercisePrice, fmv: e.fmvAtExercise ?? 0, shares: e.quantity, isIso: e.isIso })),
      ).filter((r) => r.taxYear === p.year) as unknown as Record<string, unknown>[];
    },
  },
  {
    id: "transactions",
    name: "Transactions",
    description: "Issuances, exercises, cancellations, transfers and conversions in the selected date range.",
    group: "Activity",
    icon: "history",
    params: ["range"],
    columns: [
      { key: "effectiveDate", header: "Date", type: "date" },
      { key: "type", header: "Type" },
      { key: "certificateNumber", header: "Security" },
      { key: "from", header: "From", width: 28 },
      { key: "to", header: "To", width: 28 },
      { key: "quantity", header: "Quantity", type: "shares" },
      { key: "pricePerShare", header: "Price / share", type: "money" },
      { key: "totalAmount", header: "Total", type: "money" },
      { key: "notes", header: "Notes", width: 48 },
    ],
    build: async (data, p) => {
      const certs = new Map(data.securities.map((s) => [s.id, s.certificateNumber]));
      const names = new Map(data.stakeholders.map((s) => [s.id, s.name]));
      return data.transactions
        .filter((t) => t.effectiveDate >= p.from && t.effectiveDate <= p.to)
        .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())
        .map((t) => ({ effectiveDate: t.effectiveDate, type: t.type.replace(/_/g, " ").toLowerCase(), certificateNumber: t.securityId ? certs.get(t.securityId) ?? "" : "", from: t.fromStakeholderId ? names.get(t.fromStakeholderId) ?? "" : "", to: t.toStakeholderId ? names.get(t.toStakeholderId) ?? "" : "", quantity: t.quantity, pricePerShare: t.pricePerShare, totalAmount: t.totalAmount, notes: t.notes ?? "" }));
    },
  },
  {
    id: "audit-trail",
    name: "Audit trail",
    description: "Who changed what and when, across the whole workspace.",
    group: "Activity",
    icon: "list",
    params: ["range"],
    columns: [
      { key: "createdAt", header: "Timestamp", type: "date" },
      { key: "user", header: "User", width: 24 },
      { key: "action", header: "Action" },
      { key: "entityType", header: "Entity" },
      { key: "summary", header: "Summary", width: 60 },
    ],
    build: async (data, p) => {
      const logs = await db.auditLog.findMany({ where: { companyId: data.company.id, createdAt: { gte: p.from, lte: p.to } }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 2000 });
      return logs.map((l) => ({ createdAt: l.createdAt, user: l.user?.name ?? "System", action: l.action.toLowerCase(), entityType: l.entityType, summary: l.summary }));
    },
  },
];

export const REPORT_GROUPS: ReportGroup[] = ["Cap table", "Equity", "People", "Compliance", "Activity"];

export function getReport(id: string) {
  return REPORTS.find((r) => r.id === id) ?? null;
}

/** Resolves report params from URL search params with sensible defaults. */
export function resolveParams(sp: Record<string, string | string[] | undefined>): ReportParams {
  const now = new Date();
  const g = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const parse = (v: string | undefined, fallback: Date) => {
    if (!v) return fallback;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? fallback : d;
  };
  const asOf = parse(g("asOf"), now);
  asOf.setHours(23, 59, 59, 999);
  const year = Number(g("year")) || now.getFullYear() - (now.getMonth() === 0 ? 1 : 0);
  const from = parse(g("from"), subMonths(now, 12));
  const to = parse(g("to"), now);
  to.setHours(23, 59, 59, 999);
  return { asOf, year, from, to };
}

export async function runReport(companyId: string, report: ReportDef, params: ReportParams) {
  const data = await loadCapTable(companyId, report.params.includes("asOf") ? params.asOf : undefined);
  const rows = await report.build(data, params);
  return { data, rows };
}

export interface ScheduledReport {
  id: string;
  reportId: string;
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY";
  recipients: string[];
  format: "csv" | "xlsx";
  createdAt: string;
}
