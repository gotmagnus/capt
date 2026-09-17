import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { CompanyContext } from "@/lib/auth";
import { loadCapTable, currentValuation, latestRound, type CapTableData } from "@/lib/data/captable";
import { computeVesting, type VestingResult } from "@/lib/equity/vesting";
import { CONVERTIBLE_TYPES, EXERCISABLE_TYPES, SHARE_TYPES } from "@/lib/types";

export type PortalSecurity = CapTableData["securities"][number];

export interface PortalHolding {
  security: PortalSecurity;
  vesting: VestingResult;
  /** Shares actually held (share-type securities) */
  sharesHeld: number;
  /** Unexercised / unsettled units for options, warrants and RSUs */
  unexercised: number;
  /** Vested and still unexercised (options/warrants) or vested unsettled (RSUs) */
  exercisable: number;
  /** Estimated intrinsic value of vested portion at current FMV */
  vestedValue: number;
  /** Estimated intrinsic value of the whole grant at current FMV */
  totalValue: number;
  isShares: boolean;
  isExercisable: boolean;
  isConvertible: boolean;
}

export const loadPortal = cache(async (companyId: string, ctx: CompanyContext) => {
  const [data, valuation, round, valuations] = await Promise.all([
    loadCapTable(companyId),
    currentValuation(companyId),
    latestRound(companyId),
    db.valuation.findMany({ where: { companyId, status: { in: ["ACCEPTED", "SUPERSEDED"] } }, orderBy: { valuationDate: "desc" } }),
  ]);
  const myStakeholders = data.stakeholders.filter((s) => s.userId === ctx.user.id);
  const myIds = new Set(myStakeholders.map((s) => s.id));
  const mySecurities = data.securities.filter((s) => myIds.has(s.stakeholderId));
  const fmv = valuation?.fairMarketValue ?? null;
  const asOf = new Date();

  const holdings: PortalHolding[] = mySecurities.map((s) => {
    const vesting = computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, s.vestingScheduleId ? data.schedules[s.vestingScheduleId] : null, { asOf, terminationDate: s.stakeholder.terminationDate, cancelled: s.cancelledQuantity });
    const isShares = SHARE_TYPES.includes(s.type as never);
    const isExercisable = EXERCISABLE_TYPES.includes(s.type as never);
    const isConvertible = CONVERTIBLE_TYPES.includes(s.type as never);
    const live = ["OUTSTANDING", "EXERCISED", "PENDING_SIGNATURE"].includes(s.status);
    const sharesHeld = isShares && live ? s.quantity - s.cancelledQuantity : 0;
    const unexercised = (isExercisable || s.type === "RSU") && live ? Math.max(0, s.quantity - s.exercisedQuantity - s.cancelledQuantity) : 0;
    const exercisable = s.earlyExercise && isExercisable ? unexercised : Math.max(0, Math.min(unexercised, vesting.vested - s.exercisedQuantity));
    const intrinsic = isExercisable ? Math.max(0, (fmv ?? 0) - (s.exercisePrice ?? 0)) : fmv ?? 0;
    const vestedValue = isShares ? sharesHeld * (fmv ?? 0) * (s.type === "RSA" ? vesting.percentVested : 1) : Math.max(0, vesting.vested - s.exercisedQuantity) * intrinsic;
    const totalValue = isShares ? sharesHeld * (fmv ?? 0) : unexercised * intrinsic;
    return { security: s, vesting, sharesHeld, unexercised, exercisable, vestedValue, totalValue, isShares, isExercisable, isConvertible };
  });

  const live = holdings.filter((h) => ["OUTSTANDING", "EXERCISED", "PENDING_SIGNATURE"].includes(h.security.status));
  const totalUnits = live.reduce((a, h) => a + h.sharesHeld + h.unexercised, 0);
  const vestingHoldings = live.filter((h) => h.security.vestingScheduleId && (h.isShares ? h.security.type === "RSA" : true) && !h.isConvertible);
  // Units still held under each vesting grant. Options already exercised are left out here:
  // they show up as the shares they became, and counting both put "166,666 vested" next to
  // "160,000 total" on the overview.
  const vestedUnits = vestingHoldings.reduce((a, h) => a + (h.isShares ? h.vesting.vested : Math.max(0, h.vesting.vested - h.security.exercisedQuantity)), 0);
  const vestingTotal = vestingHoldings.reduce((a, h) => a + (h.isShares ? h.vesting.total : h.unexercised), 0);
  const fullyVestedUnits = live.filter((h) => !vestingHoldings.includes(h) && !h.isConvertible).reduce((a, h) => a + h.sharesHeld + h.unexercised, 0);
  let nextVest: { date: Date; amount: number; certificateNumber: string } | null = null;
  for (const h of vestingHoldings) {
    if (h.vesting.nextVestDate && (!nextVest || h.vesting.nextVestDate < nextVest.date)) nextVest = { date: h.vesting.nextVestDate, amount: h.vesting.nextVestAmount, certificateNumber: h.security.certificateNumber };
  }
  const relationships = new Set(myStakeholders.map((s) => s.relationship));
  const myRow = data.summary.rows.filter((r) => myIds.has(r.stakeholderId));
  const ownership = {
    outstandingShares: myRow.reduce((a, r) => a + r.outstandingShares, 0),
    outstandingPct: myRow.reduce((a, r) => a + r.outstandingPct, 0),
    fullyDilutedShares: myRow.reduce((a, r) => a + r.fullyDilutedShares, 0),
    fullyDilutedPct: myRow.reduce((a, r) => a + r.fullyDilutedPct, 0),
    invested: myRow.reduce((a, r) => a + r.invested, 0),
  };

  return {
    ctx,
    data,
    valuation,
    valuations,
    round,
    fmv,
    myStakeholders,
    myIds,
    mySecurities,
    holdings,
    live,
    relationships,
    ownership,
    stats: {
      totalUnits,
      vestedUnits: vestedUnits + fullyVestedUnits,
      vestedPct: totalUnits > 0 ? (vestedUnits + fullyVestedUnits) / (vestingTotal + fullyVestedUnits || 1) : 0,
      vestedValue: live.reduce((a, h) => a + h.vestedValue, 0),
      totalValue: live.reduce((a, h) => a + h.totalValue, 0),
      nextVest,
    },
    isInvestorView: ctx.role === "INVESTOR" || ctx.role === "BOARD" || relationships.has("INVESTOR") || relationships.has("BOARD_MEMBER") || relationships.has("FOUNDER") || ctx.isWorkspace,
  };
});

export type PortalData = Awaited<ReturnType<typeof loadPortal>>;

/** Documents the portal viewer may see. */
export async function portalDocuments(p: PortalData) {
  const securityIds = p.mySecurities.map((s) => s.id);
  const stakeholderIds = [...p.myIds];
  const companyWideTypes = ["PLAN_DOCUMENT", "RULE_701"];
  const investorTypes = ["FINANCIALS", "CHARTER", "TERM_SHEET"];
  const docs = await db.document.findMany({
    where: {
      companyId: p.ctx.company.id,
      OR: [
        { stakeholderId: { in: stakeholderIds } },
        { securityId: { in: securityIds } },
        { visibility: "PUBLIC" },
        { type: { in: companyWideTypes } },
        ...(p.isInvestorView ? [{ visibility: "INVESTORS" }, { type: { in: investorTypes } }] : []),
      ],
    },
    include: { signatures: { orderBy: { sortOrder: "asc" } }, security: { select: { certificateNumber: true, type: true } } },
    orderBy: [{ folder: "asc" }, { createdAt: "desc" }],
  });
  return docs;
}

export async function canViewDocument(p: PortalData, documentId: string) {
  const docs = await portalDocuments(p);
  return docs.find((d) => d.id === documentId) ?? null;
}

/** Published updates whose audience matches the viewer. */
export async function portalUpdates(p: PortalData) {
  const updates = await db.investorUpdate.findMany({ where: { companyId: p.ctx.company.id, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, include: { views: true } });
  const rels = new Set(p.relationships);
  if (p.ctx.role === "INVESTOR") rels.add("INVESTOR");
  if (p.ctx.role === "BOARD") rels.add("BOARD_MEMBER");
  const email = p.ctx.user.email.toLowerCase();
  return updates.filter((u) => {
    let audience: string[] = [];
    let external: string[] = [];
    try {
      audience = JSON.parse(u.audience);
    } catch {}
    try {
      external = JSON.parse(u.externalEmails);
    } catch {}
    return p.ctx.isWorkspace || audience.some((a) => rels.has(a)) || external.map((e) => e.toLowerCase()).includes(email);
  });
}
