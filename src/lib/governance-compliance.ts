import "server-only";
import { addDays, addMonths, differenceInDays, isAfter, isBefore } from "date-fns";
import { db } from "@/lib/db";
import type { CapTableData } from "@/lib/data/captable";
import { buildForm3921Records, election83bStatus, isoLimitCheck, rule701Check, valuationFreshness, type Rule701Sale } from "@/lib/equity/compliance";
import { computeExpense, type ExpenseGrant } from "@/lib/equity/asc718";
import { parseJson } from "@/lib/utils";

const AWARD_TYPES = ["OPTION_ISO", "OPTION_NSO", "RSU", "RSA"];
const LIVE = ["OUTSTANDING", "EXERCISED", "PENDING_SIGNATURE"];

/** Rule 701 sales: options at exercise price × shares, full-value awards at FMV × shares. */
export function rule701Sales(data: CapTableData): Rule701Sale[] {
  return data.securities
    .filter((s) => AWARD_TYPES.includes(s.type) && s.status !== "DRAFT")
    .map((s) => ({
      securityId: s.id,
      stakeholderName: s.stakeholder.name,
      type: s.type,
      date: s.grantDate ?? s.issueDate,
      quantity: s.quantity,
      aggregateSalesPrice: s.type.startsWith("OPTION") ? (s.exercisePrice ?? 0) * s.quantity : (s.fmvAtGrant ?? s.pricePerShare ?? 0) * s.quantity,
    }));
}

export function rule701For(data: CapTableData, fmv: number | null, asOf = new Date()) {
  return rule701Check({
    sales: rule701Sales(data),
    asOf,
    totalAssets: data.company.totalAssets,
    outstandingSharesValue: fmv ? data.summary.totals.outstandingShares * fmv : null,
  });
}

export function isoLimitFor(data: CapTableData) {
  return isoLimitCheck(
    data.securities
      .filter((s) => s.type === "OPTION_ISO" && LIVE.includes(s.status))
      .map((s) => ({
        securityId: s.id,
        stakeholderId: s.stakeholderId,
        stakeholderName: s.stakeholder.name,
        grantDate: s.grantDate ?? s.issueDate,
        vestingStart: s.vestingStartDate ?? s.grantDate ?? s.issueDate,
        quantity: s.quantity,
        cancelled: s.cancelledQuantity,
        fmvAtGrant: s.fmvAtGrant ?? s.exercisePrice ?? 0,
        schedule: s.vestingScheduleId ? data.schedules[s.vestingScheduleId] ?? null : null,
      })),
  );
}

export function election83bFor(data: CapTableData, asOf = new Date()) {
  return election83bStatus(
    data.securities
      .filter((s) => (s.type === "RSA" || s.election83bDeadline) && s.status !== "DRAFT" && s.status !== "CANCELLED")
      .map((s) => ({
        securityId: s.id,
        certificateNumber: s.certificateNumber,
        stakeholderName: s.stakeholder.name,
        type: s.type,
        issueDate: s.issueDate,
        filedDate: s.election83bFiledDate,
        deadline: s.election83bDeadline,
      })),
    asOf,
  );
}

export async function form3921For(companyId: string, taxYear: number) {
  const exercises = await db.exerciseRequest.findMany({
    where: { companyId, status: "COMPLETED", isIso: true },
    include: { security: true, stakeholder: true },
  });
  const records = buildForm3921Records(
    exercises.map((e) => ({
      id: e.id,
      employeeName: e.stakeholder.name,
      address: e.stakeholder.address,
      tin: e.stakeholder.taxId,
      grantDate: e.security.grantDate ?? e.security.issueDate,
      exerciseDate: e.completedAt ?? e.paidAt ?? e.requestedAt,
      exercisePrice: e.exercisePrice,
      fmv: e.fmvAtExercise ?? 0,
      shares: e.quantity,
      isIso: e.isIso,
    })),
  ).filter((r) => r.taxYear === taxYear);
  const complianceRecords = await db.complianceRecord.findMany({ where: { companyId, type: "FORM_3921", taxYear } });
  const years = [...new Set(exercises.map((e) => (e.completedAt ?? e.paidAt ?? e.requestedAt).getFullYear()))].sort((a, b) => b - a);
  return { records, complianceRecords, years, exercises };
}

export interface Asc718Assumptions {
  volatility: number;
  riskFreeRate: number;
  forfeitureRate: number;
  method: "STRAIGHT_LINE" | "GRADED";
}

export function asc718Assumptions(company: { settings: string }): Asc718Assumptions {
  const s = parseJson<Partial<Asc718Assumptions>>(company.settings, {});
  const a = (s as { asc718?: Partial<Asc718Assumptions> }).asc718 ?? {};
  return { volatility: a.volatility ?? 0.55, riskFreeRate: a.riskFreeRate ?? 0.04, forfeitureRate: a.forfeitureRate ?? 0, method: a.method ?? "STRAIGHT_LINE" };
}

export function expenseGrantsFor(data: CapTableData): ExpenseGrant[] {
  return data.securities
    .filter((s) => AWARD_TYPES.includes(s.type) && s.status !== "DRAFT")
    .map((s) => ({
      id: s.id,
      stakeholderId: s.stakeholderId,
      stakeholderName: s.stakeholder.name,
      department: s.stakeholder.costCenter ?? s.stakeholder.department ?? null,
      type: s.type,
      quantity: s.quantity,
      grantDate: s.grantDate ?? s.issueDate,
      vestingStart: s.vestingStartDate ?? s.grantDate ?? s.issueDate,
      schedule: s.vestingScheduleId ? data.schedules[s.vestingScheduleId] ?? null : null,
      strike: s.exercisePrice,
      fmvAtGrant: s.fmvAtGrant ?? s.exercisePrice ?? s.pricePerShare ?? 0,
      terminationDate: s.stakeholder.terminationDate ?? null,
      cancelledQuantity: s.cancelledQuantity,
    }));
}

export function asc718Report(data: CapTableData, periodStart: Date, periodEnd: Date, a: Asc718Assumptions, method = a.method) {
  return computeExpense(expenseGrantsFor(data), periodStart, periodEnd, { method, volatility: a.volatility, riskFreeRate: a.riskFreeRate, forfeitureRate: a.forfeitureRate });
}

export function fiscalPeriod(fiscalYearEnd: string, fy: number, quarter?: number | null) {
  const [m, d] = fiscalYearEnd.split("-").map(Number);
  const end = new Date(fy, (m || 12) - 1, d || 31, 23, 59, 59);
  const start = addDays(addMonths(end, -12), 1);
  start.setHours(0, 0, 0, 0);
  if (quarter && quarter >= 1 && quarter <= 4) {
    const qs = addMonths(start, (quarter - 1) * 3);
    const qe = addDays(addMonths(qs, 3), -1);
    qe.setHours(23, 59, 59);
    return { start: qs, end: qe, label: `Q${quarter} FY${fy}` };
  }
  return { start, end, label: `FY${fy}` };
}

export interface CalendarItem {
  date: Date;
  title: string;
  detail: string;
  kind: "409A" | "3921" | "83B" | "NOTE" | "OPTION_EXPIRY" | "PTEP" | "701";
  href: string;
  overdue: boolean;
  daysAway: number;
}

export function complianceCalendar(data: CapTableData, valuationDate: Date | null, asOf = new Date()): CalendarItem[] {
  const C = data.company.id;
  const items: CalendarItem[] = [];
  const push = (date: Date, title: string, detail: string, kind: CalendarItem["kind"], href: string) =>
    items.push({ date, title, detail, kind, href, overdue: isBefore(date, asOf), daysAway: differenceInDays(date, asOf) });

  const fresh = valuationFreshness(valuationDate, asOf);
  if (fresh.expiresOn) push(fresh.expiresOn, "409A safe harbor expires", "New grants after this date need a refreshed valuation.", "409A", `/app/${C}/valuations`);
  else push(asOf, "No accepted 409A valuation", "Request a valuation before granting options.", "409A", `/app/${C}/valuations`);

  const lastYear = asOf.getFullYear() - 1;
  const priorYearIsoExercises = data.transactions.filter((t) => t.type === "EXERCISE" && t.effectiveDate.getFullYear() === lastYear);
  if (priorYearIsoExercises.length) push(new Date(asOf.getFullYear(), 0, 31), `Form 3921 for ${lastYear} exercises`, `${priorYearIsoExercises.length} exercise(s) — Copy B to employees by Jan 31, Copy A to IRS by Mar 31.`, "3921", `/app/${C}/compliance/form-3921?year=${lastYear}`);
  const thisYearExercises = data.transactions.filter((t) => t.type === "EXERCISE" && t.effectiveDate.getFullYear() === asOf.getFullYear());
  if (thisYearExercises.length) push(new Date(asOf.getFullYear() + 1, 0, 31), `Form 3921 for ${asOf.getFullYear()} exercises`, `${thisYearExercises.length} exercise(s) so far this year.`, "3921", `/app/${C}/compliance/form-3921?year=${asOf.getFullYear()}`);

  for (const e of election83bFor(data, asOf)) {
    if (e.status === "DUE" || e.status === "OVERDUE") push(e.deadline, `83(b) election — ${e.stakeholderName}`, `${e.certificateNumber} · ${e.status === "OVERDUE" ? "past the 30-day window" : `${e.daysRemaining} days left`}`, "83B", `/app/${C}/compliance/83b`);
  }

  for (const s of data.securities) {
    if (s.type === "CONVERTIBLE_NOTE" && s.status === "OUTSTANDING" && s.maturityDate) {
      push(s.maturityDate, `Note maturity — ${s.stakeholder.name}`, `${s.certificateNumber} matures; repay or convert.`, "NOTE", `/app/${C}/securities/${s.id}`);
    }
    if ((s.type === "OPTION_ISO" || s.type === "OPTION_NSO" || s.type === "WARRANT") && s.status === "OUTSTANDING" && s.expirationDate) {
      const unexercised = s.quantity - s.exercisedQuantity - s.cancelledQuantity;
      if (unexercised > 0 && differenceInDays(s.expirationDate, asOf) <= 90) push(s.expirationDate, `${s.certificateNumber} expires — ${s.stakeholder.name}`, `${Math.round(unexercised).toLocaleString()} unexercised.`, "OPTION_EXPIRY", `/app/${C}/securities/${s.id}`);
    }
    if ((s.type === "OPTION_ISO" || s.type === "OPTION_NSO") && s.status === "OUTSTANDING" && s.stakeholder.terminationDate) {
      const unexercised = s.quantity - s.exercisedQuantity - s.cancelledQuantity;
      const ptepEnd = addMonths(s.stakeholder.terminationDate, s.ptepMonths ?? 3);
      if (unexercised > 0 && isAfter(ptepEnd, addDays(asOf, -30))) push(ptepEnd, `Post-termination exercise window closes — ${s.stakeholder.name}`, `${s.certificateNumber}: ${Math.round(unexercised).toLocaleString()} vested options must be exercised or they expire.`, "PTEP", `/app/${C}/securities/${s.id}`);
    }
  }
  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}
