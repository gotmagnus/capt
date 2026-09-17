import type { CapTableSummary } from "./captable";
import { solveConversions, type ConversionResult, type ConvertibleInput } from "./conversion";

/**
 * Priced-round pro-forma modeler.
 *
 * Solves the standard circularity between price per share, option pool top-up and
 * convertible conversion using fixed-point iteration:
 *   pps = preMoney / (preRoundFD + poolIncrease + convertedShares)
 *   poolIncrease sized so (available + poolIncrease) / postFD == targetPoolPct   (pre-money top-up)
 */

export interface NewInvestor {
  id?: string;
  name: string;
  amount: number;
  stakeholderId?: string | null; // existing holder (pro-rata) or new investor
}

export interface RoundModelInput {
  capTable: CapTableSummary;
  preMoneyValuation: number;
  investors: NewInvestor[];
  /** Target unallocated pool as % of post-money fully diluted (e.g. 10). Null = no top-up. */
  targetPoolPct?: number | null;
  /** Explicit shares to add to the pool, overrides targetPoolPct. */
  poolSharesToAdd?: number | null;
  /** Whether the pool top-up is included in the pre-money (dilutes existing holders only). */
  poolTiming?: "PRE" | "POST";
  convertibles?: ConvertibleInput[];
  convertSafes?: boolean;
  convertNotes?: boolean;
  applyMfn?: boolean;
  /** Existing holders exercising pro-rata rights: fraction of the round they take, computed from FD ownership. */
  proRataStakeholderIds?: string[];
  newShareClassName?: string;
  asOf?: Date;
}

export interface ProFormaRow {
  key: string;
  stakeholderId: string | null;
  name: string;
  relationship: string;
  kind: "EXISTING" | "NEW_INVESTOR" | "CONVERSION" | "POOL" | "TOTAL";
  preShares: number;
  prePct: number;
  newShares: number;
  postShares: number;
  postPct: number;
  investedThisRound: number;
  dilutionPct: number; // pct-point change (negative = diluted)
}

export interface RoundModelResult {
  pricePerShare: number;
  preMoneyValuation: number;
  postMoneyValuation: number;
  totalRaised: number;
  newMoneyShares: number;
  poolIncrease: number;
  poolPostPct: number;
  convertedShares: number;
  conversions: ConversionResult[];
  preFullyDiluted: number;
  postFullyDiluted: number;
  newInvestorPct: number;
  rows: ProFormaRow[];
  iterations: number;
  warnings: string[];
}

export function modelRound(input: RoundModelInput): RoundModelResult {
  const ct = input.capTable;
  const warnings: string[] = [];
  const preFD = ct.totals.fullyDilutedShares;
  const availablePool = ct.totals.poolAvailable;
  const convertibles = (input.convertibles ?? []).filter((c) =>
    c.type === "SAFE" ? input.convertSafes !== false : input.convertNotes !== false,
  );
  const totalRaised = input.investors.reduce((a, i) => a + Math.max(0, i.amount), 0);
  const poolTiming = input.poolTiming ?? "PRE";

  let poolIncrease = input.poolSharesToAdd ?? 0;
  let convertedShares = 0;
  let pps = preFD > 0 ? input.preMoneyValuation / preFD : 0;
  let conversions: ConversionResult[] = [];
  let iterations = 0;
  let newMoneyShares = 0;

  for (iterations = 0; iterations < 100; iterations++) {
    const prevPps = pps;
    const prevPool = poolIncrease;
    const base = preFD + (poolTiming === "PRE" ? poolIncrease : 0);
    pps = base > 0 ? input.preMoneyValuation / (base + convertedShares) : 0;
    newMoneyShares = pps > 0 ? Math.floor(totalRaised / pps) : 0;
    const postFD = preFD + poolIncrease + convertedShares + newMoneyShares;

    if (input.poolSharesToAdd == null && input.targetPoolPct != null && input.targetPoolPct > 0) {
      const target = input.targetPoolPct / 100;
      // (available + x) / (postFD_without_x + x) = target  =>  x = (target * postFDwo - available) / (1 - target)
      const postWithoutPool = preFD + convertedShares + newMoneyShares;
      const x = (target * postWithoutPool - availablePool) / (1 - target);
      poolIncrease = Math.max(0, Math.round(x));
    }

    if (convertibles.length) {
      const solved = solveConversions({
        convertibles,
        preRoundFullyDiluted: preFD,
        poolIncrease: poolTiming === "PRE" ? poolIncrease : 0,
        roundPricePerShare: pps,
        asOf: input.asOf,
        applyMfn: input.applyMfn,
      });
      conversions = solved.results;
      convertedShares = solved.totalConvertedShares;
    }

    if (Math.abs(pps - prevPps) < 1e-9 && poolIncrease === prevPool && postFD === preFD + poolIncrease + convertedShares + newMoneyShares) {
      if (iterations > 0) break;
    }
  }

  if (pps <= 0) warnings.push("Price per share could not be derived; check pre-money valuation and fully diluted shares.");
  const postFD = preFD + poolIncrease + convertedShares + newMoneyShares;
  const postMoney = pps * postFD;

  const rows: ProFormaRow[] = [];
  const investorSharesByStakeholder = new Map<string, { shares: number; amount: number }>();
  const newInvestorRows: ProFormaRow[] = [];
  for (const inv of input.investors) {
    const shares = pps > 0 ? Math.floor(inv.amount / pps) : 0;
    if (inv.stakeholderId) {
      const cur = investorSharesByStakeholder.get(inv.stakeholderId) ?? { shares: 0, amount: 0 };
      investorSharesByStakeholder.set(inv.stakeholderId, { shares: cur.shares + shares, amount: cur.amount + inv.amount });
    } else {
      newInvestorRows.push({
        key: `new-${inv.id ?? inv.name}`,
        stakeholderId: null,
        name: inv.name,
        relationship: "INVESTOR",
        kind: "NEW_INVESTOR",
        preShares: 0,
        prePct: 0,
        newShares: shares,
        postShares: shares,
        postPct: postFD > 0 ? shares / postFD : 0,
        investedThisRound: inv.amount,
        dilutionPct: 0,
      });
    }
  }
  const conversionByStakeholder = new Map<string, number>();
  for (const c of conversions) conversionByStakeholder.set(c.stakeholderId, (conversionByStakeholder.get(c.stakeholderId) ?? 0) + c.shares);

  for (const r of ct.rows) {
    const pro = investorSharesByStakeholder.get(r.stakeholderId);
    const conv = conversionByStakeholder.get(r.stakeholderId) ?? 0;
    const newShares = (pro?.shares ?? 0) + conv;
    const postShares = r.fullyDilutedShares + newShares;
    const postPct = postFD > 0 ? postShares / postFD : 0;
    rows.push({
      key: r.stakeholderId,
      stakeholderId: r.stakeholderId,
      name: r.name,
      relationship: r.relationship,
      kind: "EXISTING",
      preShares: r.fullyDilutedShares,
      prePct: r.fullyDilutedPct,
      newShares,
      postShares,
      postPct,
      investedThisRound: pro?.amount ?? 0,
      dilutionPct: (postPct - r.fullyDilutedPct) * 100,
    });
    investorSharesByStakeholder.delete(r.stakeholderId);
    conversionByStakeholder.delete(r.stakeholderId);
  }
  // Convertible holders who hold nothing else yet
  for (const [stakeholderId, shares] of conversionByStakeholder) {
    const c = conversions.find((x) => x.stakeholderId === stakeholderId);
    rows.push({
      key: `conv-${stakeholderId}`,
      stakeholderId,
      name: c ? `Convertible holder` : "Convertible holder",
      relationship: "INVESTOR",
      kind: "CONVERSION",
      preShares: 0,
      prePct: 0,
      newShares: shares,
      postShares: shares,
      postPct: postFD > 0 ? shares / postFD : 0,
      investedThisRound: 0,
      dilutionPct: 0,
    });
  }
  rows.push(...newInvestorRows);
  const poolPost = availablePool + poolIncrease;
  rows.push({
    key: "pool",
    stakeholderId: null,
    name: "Unallocated option pool",
    relationship: "POOL",
    kind: "POOL",
    preShares: availablePool,
    prePct: preFD > 0 ? availablePool / preFD : 0,
    newShares: poolIncrease,
    postShares: poolPost,
    postPct: postFD > 0 ? poolPost / postFD : 0,
    investedThisRound: 0,
    dilutionPct: postFD > 0 && preFD > 0 ? (poolPost / postFD - availablePool / preFD) * 100 : 0,
  });
  rows.sort((a, b) => {
    if (a.kind === "POOL") return 1;
    if (b.kind === "POOL") return -1;
    return b.postShares - a.postShares;
  });
  rows.push({
    key: "total",
    stakeholderId: null,
    name: "Total",
    relationship: "TOTAL",
    kind: "TOTAL",
    preShares: preFD,
    prePct: 1,
    newShares: postFD - preFD,
    postShares: postFD,
    postPct: 1,
    investedThisRound: totalRaised,
    dilutionPct: 0,
  });

  return {
    pricePerShare: pps,
    preMoneyValuation: input.preMoneyValuation,
    postMoneyValuation: postMoney,
    totalRaised,
    newMoneyShares,
    poolIncrease,
    poolPostPct: postFD > 0 ? poolPost / postFD : 0,
    convertedShares,
    conversions,
    preFullyDiluted: preFD,
    postFullyDiluted: postFD,
    newInvestorPct: postFD > 0 ? newMoneyShares / postFD : 0,
    rows,
    iterations,
    warnings,
  };
}

/** Sensitivity grid: how founder/existing ownership changes across valuations and raise amounts. */
export function dilutionGrid(
  base: Omit<RoundModelInput, "preMoneyValuation" | "investors">,
  valuations: number[],
  raises: number[],
  stakeholderId?: string,
) {
  return valuations.map((v) => ({
    preMoney: v,
    cells: raises.map((raise) => {
      const res = modelRound({ ...base, preMoneyValuation: v, investors: [{ name: "New investors", amount: raise }] });
      const row = stakeholderId ? res.rows.find((r) => r.stakeholderId === stakeholderId) : undefined;
      return {
        raise,
        pricePerShare: res.pricePerShare,
        postMoney: res.postMoneyValuation,
        newInvestorPct: res.newInvestorPct,
        holderPct: row?.postPct ?? null,
      };
    }),
  }));
}
