import type { ShareClassLike } from "./captable";

/**
 * Exit waterfall with stacked liquidation preferences, participation (capped/uncapped),
 * non-participating conversion decisions and in-the-money option exercise.
 *
 * Algorithm: start with every preferred class taking its preference and every option
 * unexercised. Iterate: (1) pay preferences by seniority, pari passu within a tier;
 * (2) distribute the remainder pro-rata to common + converted preferred + participating
 * preferred (capped classes limited to their cap); (3) any non-participating class whose
 * as-converted value exceeds its preference converts; capped participating classes convert
 * when as-converted exceeds the cap; options exercise when the common price exceeds strike.
 * Repeat until decisions are stable.
 */

export interface WaterfallHolding {
  stakeholderId: string;
  stakeholderName: string;
  relationship: string;
  securityId: string;
  kind: "SHARES" | "OPTION" | "WARRANT" | "RSU";
  shareClassId: string | null; // null => common
  shares: number; // as-issued (preferred converts using conversionRatio)
  originalIssuePrice?: number | null; // per-share preference basis for preferred
  exercisePrice?: number | null;
  vested?: number; // for options: vested count; unvested treated per `includeUnvested`
  invested?: number; // cash basis for MOIC
}

export interface WaterfallInput {
  exitValue: number;
  shareClasses: ShareClassLike[];
  holdings: WaterfallHolding[];
  debt?: number;
  transactionCosts?: number; // absolute
  transactionCostPct?: number; // % of exit
  includeUnvestedOptions?: boolean; // treat unvested as accelerated
  /** Unallocated pool shares to include as-if-issued (usually excluded). */
  unallocatedPool?: number;
  asOf?: Date;
  /** Accrued dividends per class id (absolute) to add to preference. */
  accruedDividends?: Record<string, number>;
}

export interface ClassOutcome {
  shareClassId: string | null;
  name: string;
  type: string;
  shares: number;
  asConvertedShares: number;
  preference: number;
  preferencePaid: number;
  participation: number;
  total: number;
  perShare: number;
  converted: boolean;
  participating: boolean;
  capped: boolean;
}

export interface HolderOutcome {
  stakeholderId: string;
  name: string;
  relationship: string;
  proceeds: number;
  pctOfProceeds: number;
  invested: number;
  moic: number | null;
  breakdown: { securityId: string; kind: string; className: string; shares: number; proceeds: number; exerciseCost: number }[];
}

export interface WaterfallResult {
  exitValue: number;
  debt: number;
  transactionCosts: number;
  distributable: number;
  exerciseProceeds: number;
  commonPricePerShare: number;
  classes: ClassOutcome[];
  holders: HolderOutcome[];
  totalPreferencePaid: number;
  totalToCommon: number;
  iterations: number;
}

interface ClassState extends ShareClassLike {
  converted: boolean;
  shares: number;
  asConverted: number;
  preference: number;
}

export function computeWaterfall(input: WaterfallInput): WaterfallResult {
  const debt = input.debt ?? 0;
  const costs = (input.transactionCosts ?? 0) + (input.transactionCostPct ? (input.exitValue * input.transactionCostPct) / 100 : 0);
  const distributableBase = Math.max(0, input.exitValue - debt - costs);

  const classById = new Map(input.shareClasses.map((c) => [c.id, c]));
  const classes: ClassState[] = input.shareClasses
    .filter((c) => c.type === "PREFERRED")
    .map((c) => ({ ...c, converted: false, shares: 0, asConverted: 0, preference: 0 }));
  const classState = new Map(classes.map((c) => [c.id, c]));

  // aggregate holdings by class
  for (const h of input.holdings) {
    if (h.kind !== "SHARES" || !h.shareClassId) continue;
    const cs = classState.get(h.shareClassId);
    if (!cs) continue;
    cs.shares += h.shares;
    cs.asConverted += h.shares * (cs.conversionRatio || 1);
    const oip = h.originalIssuePrice ?? cs.originalIssuePrice ?? 0;
    cs.preference += h.shares * oip * (cs.liquidationMultiple || 1);
  }
  for (const cs of classes) cs.preference += input.accruedDividends?.[cs.id] ?? 0;

  const commonShares = input.holdings
    .filter((h) => h.kind === "SHARES" && (!h.shareClassId || classById.get(h.shareClassId)?.type !== "PREFERRED"))
    .reduce((a, h) => a + h.shares, 0);
  const rsuShares = input.holdings.filter((h) => h.kind === "RSU").reduce((a, h) => a + h.shares, 0);
  const poolShares = input.unallocatedPool ?? 0;

  const options = input.holdings
    .filter((h) => h.kind === "OPTION" || h.kind === "WARRANT")
    .map((h) => ({
      ...h,
      count: input.includeUnvestedOptions ? h.shares : Math.min(h.shares, h.vested ?? h.shares),
      exercised: false,
    }));

  let iterations = 0;
  let commonPps = 0;
  let classOutcomes: ClassOutcome[] = [];
  let exerciseProceeds = 0;
  let totalPrefPaid = 0;
  let totalToCommon = 0;
  let distributable = distributableBase;

  for (iterations = 0; iterations < 50; iterations++) {
    exerciseProceeds = options.filter((o) => o.exercised).reduce((a, o) => a + o.count * (o.exercisePrice ?? 0), 0);
    distributable = distributableBase + exerciseProceeds;
    let remaining = distributable;

    // 1. preferences by seniority (lower number = more senior), pari passu within tier
    const prefPaid = new Map<string, number>();
    const tiers = [...new Set(classes.filter((c) => !c.converted).map((c) => c.seniority))].sort((a, b) => a - b);
    for (const tier of tiers) {
      const tierClasses = classes.filter((c) => !c.converted && c.seniority === tier);
      const tierPref = tierClasses.reduce((a, c) => a + c.preference, 0);
      const pay = Math.min(remaining, tierPref);
      for (const c of tierClasses) prefPaid.set(c.id, tierPref > 0 ? (pay * c.preference) / tierPref : 0);
      remaining -= pay;
    }

    // 2. residual sharing among common-equivalent shares
    const exercisedOptionShares = options.filter((o) => o.exercised).reduce((a, o) => a + o.count, 0);
    const participants = classes.filter((c) => c.converted || c.participating);
    const participationPaid = new Map<string, number>();
    let residual = remaining;
    let sharingPool = commonShares + rsuShares + poolShares + exercisedOptionShares + participants.reduce((a, c) => a + c.asConverted, 0);
    // capped participating classes: pay up to cap, then remove from pool and redistribute
    const cappedOut = new Set<string>();
    for (let pass = 0; pass < 10; pass++) {
      const pps = sharingPool > 0 ? residual / sharingPool : 0;
      let changed = false;
      for (const c of participants) {
        if (c.converted || cappedOut.has(c.id) || !c.participationCap) continue;
        const capTotal = c.shares * (c.originalIssuePrice ?? 0) * c.participationCap;
        const wouldGet = (prefPaid.get(c.id) ?? 0) + c.asConverted * pps;
        if (wouldGet > capTotal) {
          const allowedParticipation = Math.max(0, capTotal - (prefPaid.get(c.id) ?? 0));
          participationPaid.set(c.id, allowedParticipation);
          residual -= allowedParticipation;
          sharingPool -= c.asConverted;
          cappedOut.add(c.id);
          changed = true;
        }
      }
      if (!changed) break;
    }
    commonPps = sharingPool > 0 ? residual / sharingPool : 0;
    for (const c of participants) {
      if (!cappedOut.has(c.id)) participationPaid.set(c.id, c.asConverted * commonPps);
    }

    // 3. re-evaluate decisions
    let changed = false;
    for (const c of classes) {
      const asConvertedValue = c.asConverted * commonPps;
      if (!c.participating) {
        const shouldConvert = asConvertedValue > c.preference && commonPps > 0;
        if (shouldConvert !== c.converted) {
          c.converted = shouldConvert;
          changed = true;
        }
      } else if (c.participationCap) {
        const capTotal = c.shares * (c.originalIssuePrice ?? 0) * c.participationCap;
        const shouldConvert = asConvertedValue > capTotal && commonPps > 0;
        if (shouldConvert !== c.converted) {
          c.converted = shouldConvert;
          changed = true;
        }
      }
    }
    for (const o of options) {
      const inTheMoney = commonPps > (o.exercisePrice ?? 0) && o.count > 0;
      if (inTheMoney !== o.exercised) {
        o.exercised = inTheMoney;
        changed = true;
      }
    }

    classOutcomes = classes.map((c) => {
      const pref = c.converted ? 0 : prefPaid.get(c.id) ?? 0;
      const part = c.converted ? c.asConverted * commonPps : c.participating ? participationPaid.get(c.id) ?? 0 : 0;
      return {
        shareClassId: c.id,
        name: c.name,
        type: c.type,
        shares: c.shares,
        asConvertedShares: c.asConverted,
        preference: c.preference,
        preferencePaid: pref,
        participation: part,
        total: pref + part,
        perShare: c.shares > 0 ? (pref + part) / c.shares : 0,
        converted: c.converted,
        participating: c.participating,
        capped: cappedOut.has(c.id),
      };
    });
    totalPrefPaid = classOutcomes.reduce((a, c) => a + c.preferencePaid, 0);
    totalToCommon = (commonShares + rsuShares + poolShares + exercisedOptionShares) * commonPps;

    if (!changed) break;
  }

  const commonOutcome: ClassOutcome = {
    shareClassId: null,
    name: "Common",
    type: "COMMON",
    shares: commonShares,
    asConvertedShares: commonShares,
    preference: 0,
    preferencePaid: 0,
    participation: commonShares * commonPps,
    total: commonShares * commonPps,
    perShare: commonPps,
    converted: false,
    participating: true,
    capped: false,
  };

  // per-holder allocation
  const holders = new Map<string, HolderOutcome>();
  const outcomeByClass = new Map(classOutcomes.map((c) => [c.shareClassId as string, c]));
  const ensure = (h: WaterfallHolding) => {
    let x = holders.get(h.stakeholderId);
    if (!x) {
      x = { stakeholderId: h.stakeholderId, name: h.stakeholderName, relationship: h.relationship, proceeds: 0, pctOfProceeds: 0, invested: 0, moic: null, breakdown: [] };
      holders.set(h.stakeholderId, x);
    }
    return x;
  };
  for (const h of input.holdings) {
    const holder = ensure(h);
    holder.invested += h.invested ?? 0;
    if (h.kind === "SHARES") {
      const cls = h.shareClassId ? classById.get(h.shareClassId) : undefined;
      let proceeds = 0;
      let className = "Common";
      if (cls && cls.type === "PREFERRED") {
        const oc = outcomeByClass.get(cls.id);
        proceeds = oc ? oc.perShare * h.shares : 0;
        className = cls.name;
      } else {
        proceeds = h.shares * commonPps;
        className = cls?.name ?? "Common";
      }
      holder.proceeds += proceeds;
      holder.breakdown.push({ securityId: h.securityId, kind: h.kind, className, shares: h.shares, proceeds, exerciseCost: 0 });
    } else if (h.kind === "RSU") {
      const proceeds = h.shares * commonPps;
      holder.proceeds += proceeds;
      holder.breakdown.push({ securityId: h.securityId, kind: h.kind, className: "RSU", shares: h.shares, proceeds, exerciseCost: 0 });
    } else {
      const o = options.find((x) => x.securityId === h.securityId);
      if (!o || !o.exercised) {
        holder.breakdown.push({ securityId: h.securityId, kind: h.kind, className: h.kind === "WARRANT" ? "Warrant" : "Option", shares: 0, proceeds: 0, exerciseCost: 0 });
        continue;
      }
      const exerciseCost = o.count * (o.exercisePrice ?? 0);
      const proceeds = o.count * commonPps - exerciseCost;
      holder.proceeds += proceeds;
      holder.breakdown.push({ securityId: h.securityId, kind: h.kind, className: h.kind === "WARRANT" ? "Warrant" : "Option", shares: o.count, proceeds, exerciseCost });
    }
  }
  const totalProceeds = [...holders.values()].reduce((a, h) => a + h.proceeds, 0);
  const holderList = [...holders.values()]
    .map((h) => ({
      ...h,
      pctOfProceeds: totalProceeds > 0 ? h.proceeds / totalProceeds : 0,
      moic: h.invested > 0 ? h.proceeds / h.invested : null,
    }))
    .sort((a, b) => b.proceeds - a.proceeds);

  return {
    exitValue: input.exitValue,
    debt,
    transactionCosts: costs,
    distributable,
    exerciseProceeds,
    commonPricePerShare: commonPps,
    classes: [...classOutcomes.sort((a, b) => (classById.get(a.shareClassId!)?.seniority ?? 99) - (classById.get(b.shareClassId!)?.seniority ?? 99)), commonOutcome],
    holders: holderList,
    totalPreferencePaid: totalPrefPaid,
    totalToCommon,
    iterations,
  };
}

/** Payout curve across exit values, for charts and breakpoint tables. */
export function waterfallCurve(input: Omit<WaterfallInput, "exitValue">, exitValues: number[]) {
  return exitValues.map((exitValue) => {
    const r = computeWaterfall({ ...input, exitValue });
    const byClass: Record<string, number> = {};
    for (const c of r.classes) byClass[c.name] = c.total;
    const byHolder: Record<string, number> = {};
    for (const h of r.holders) byHolder[h.stakeholderId] = h.proceeds;
    return { exitValue, commonPricePerShare: r.commonPricePerShare, byClass, byHolder, totalPreferencePaid: r.totalPreferencePaid };
  });
}

export function defaultExitValues(max: number, steps = 12) {
  const out: number[] = [];
  for (let i = 1; i <= steps; i++) out.push(Math.round((max * i) / steps));
  return out;
}
