import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { buildCapTable, type CapTableSummary } from "@/lib/equity/captable";
import type { VestingScheduleInput } from "@/lib/equity/vesting";
import type { WaterfallHolding } from "@/lib/equity/waterfall";
import type { ConvertibleInput } from "@/lib/equity/conversion";
import { computeVesting } from "@/lib/equity/vesting";
import { CONVERTIBLE_TYPES, EXERCISABLE_TYPES, SHARE_TYPES } from "@/lib/types";

/** Loads everything needed to compute the cap table for a company. */
export const loadCapTable = cache(async (companyId: string, asOf?: Date) => {
  const [company, shareClasses, stakeholders, equityPlans, securities, vestingSchedules, transactions] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId } }),
    db.shareClass.findMany({ where: { companyId }, orderBy: [{ type: "desc" }, { seniority: "asc" }] }),
    db.stakeholder.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    db.equityPlan.findMany({ where: { companyId }, orderBy: { adoptionDate: "asc" } }),
    db.security.findMany({ where: { companyId }, include: { stakeholder: true, shareClass: true, equityPlan: true, vestingSchedule: { include: { milestones: true } } }, orderBy: { issueDate: "asc" } }),
    db.vestingSchedule.findMany({ where: { companyId }, include: { milestones: { orderBy: { sortOrder: "asc" } } } }),
    db.transaction.findMany({ where: { companyId }, orderBy: { effectiveDate: "asc" } }),
  ]);
  const schedules: Record<string, VestingScheduleInput> = Object.fromEntries(
    vestingSchedules.map((v) => [v.id, { ...v, milestones: v.milestones.map((m) => ({ percent: m.percent, achievedAt: m.achievedAt, description: m.description })) }]),
  );
  const summary: CapTableSummary = buildCapTable({
    shareClasses,
    stakeholders,
    equityPlans,
    securities,
    vestingSchedules: schedules,
    transactions,
    asOf,
  });
  return { company, shareClasses, stakeholders, equityPlans, securities, vestingSchedules, schedules, transactions, summary };
});

export type CapTableData = Awaited<ReturnType<typeof loadCapTable>>;

/** Latest accepted 409A. */
export const currentValuation = cache(async (companyId: string) => {
  return db.valuation.findFirst({ where: { companyId, status: "ACCEPTED" }, orderBy: { valuationDate: "desc" } });
});

export const latestRound = cache(async (companyId: string) => {
  return db.fundingRound.findFirst({ where: { companyId, status: "CLOSED", roundType: "PRICED" }, orderBy: { closeDate: "desc" }, include: { shareClass: true } });
});

/** Waterfall holdings derived from live securities. */
export function waterfallHoldings(data: CapTableData, asOf = new Date()): WaterfallHolding[] {
  const holdings: WaterfallHolding[] = [];
  for (const s of data.securities) {
    if (!["OUTSTANDING", "EXERCISED", "PENDING_SIGNATURE"].includes(s.status)) continue;
    const base = { stakeholderId: s.stakeholderId, stakeholderName: s.stakeholder.name, relationship: s.stakeholder.relationship, securityId: s.id };
    if (SHARE_TYPES.includes(s.type as never)) {
      const qty = s.quantity - s.cancelledQuantity;
      if (qty <= 0) continue;
      holdings.push({ ...base, kind: "SHARES", shareClassId: s.shareClass?.type === "PREFERRED" ? s.shareClassId : null, shares: qty, originalIssuePrice: s.pricePerShare ?? s.shareClass?.originalIssuePrice ?? null, invested: (s.pricePerShare ?? 0) * qty });
    } else if (EXERCISABLE_TYPES.includes(s.type as never)) {
      const unexercised = s.quantity - s.exercisedQuantity - s.cancelledQuantity;
      if (unexercised <= 0) continue;
      const vest = computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, s.vestingScheduleId ? data.schedules[s.vestingScheduleId] : null, { asOf, terminationDate: s.stakeholder.terminationDate, cancelled: s.cancelledQuantity });
      holdings.push({ ...base, kind: s.type === "WARRANT" ? "WARRANT" : "OPTION", shareClassId: null, shares: unexercised, vested: Math.max(0, vest.vested - s.exercisedQuantity), exercisePrice: s.exercisePrice ?? 0 });
    } else if (s.type === "RSU") {
      const unsettled = s.quantity - s.exercisedQuantity - s.cancelledQuantity;
      if (unsettled > 0) holdings.push({ ...base, kind: "RSU", shareClassId: null, shares: unsettled });
    }
  }
  return holdings;
}

/** Outstanding SAFEs / notes as conversion inputs. */
export function convertibles(data: CapTableData): ConvertibleInput[] {
  return data.securities
    .filter((s) => CONVERTIBLE_TYPES.includes(s.type as never) && s.status === "OUTSTANDING")
    .map((s) => ({
      id: s.id,
      type: s.type,
      stakeholderId: s.stakeholderId,
      principal: s.totalAmount ?? 0,
      valuationCap: s.valuationCap,
      discountPercent: s.discountPercent,
      safeType: s.safeType,
      interestRate: s.interestRate,
      interestType: s.interestType,
      issueDate: s.issueDate,
      mfn: s.mfn,
      proRataRight: s.proRataRight,
    }));
}

/** Per-security vesting snapshot used by lists and portals. */
export function vestingFor(data: CapTableData, securityId: string, asOf = new Date()) {
  const s = data.securities.find((x) => x.id === securityId);
  if (!s) return null;
  return computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, s.vestingScheduleId ? data.schedules[s.vestingScheduleId] : null, { asOf, terminationDate: s.stakeholder.terminationDate, cancelled: s.cancelledQuantity });
}

export const companyNav = cache(async (companyId: string) => {
  const [openTasks, pendingSignatures, pendingExercises, pendingConsents] = await Promise.all([
    db.notification.count({ where: { companyId, status: "OPEN" } }),
    db.document.count({ where: { companyId, signatureStatus: { in: ["PENDING", "PARTIALLY_SIGNED"] } } }),
    db.exerciseRequest.count({ where: { companyId, status: { in: ["REQUESTED", "APPROVED", "PAYMENT_PENDING", "PAID"] } } }),
    db.boardConsent.count({ where: { companyId, status: "SENT" } }),
  ]);
  return { openTasks, pendingSignatures, pendingExercises, pendingConsents };
});
