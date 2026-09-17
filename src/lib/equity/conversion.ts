import { differenceInDays } from "date-fns";

/**
 * Convertible instrument conversion math (YC pre-money & post-money SAFEs, convertible notes).
 *
 * Post-money SAFE: price = cap / post-money SAFE capitalization (all shares, options, pool
 * incl. round top-up, and every converting SAFE, but excluding new-money shares). Because each
 * SAFE's share count depends on the others', callers solve with `solveConversions`, which
 * iterates to a fixed point.
 */

export interface ConvertibleInput {
  id: string;
  type: "SAFE" | "CONVERTIBLE_NOTE" | string;
  stakeholderId: string;
  principal: number;
  valuationCap?: number | null;
  discountPercent?: number | null; // 20 = 20% discount
  safeType?: "PRE_MONEY" | "POST_MONEY" | string | null;
  interestRate?: number | null; // annual %
  interestType?: "SIMPLE" | "COMPOUND" | string | null;
  issueDate?: Date | string | null;
  mfn?: boolean;
  proRataRight?: boolean;
}

export interface ConversionResult {
  id: string;
  stakeholderId: string;
  principal: number;
  accruedInterest: number;
  amount: number; // principal + interest converting
  conversionPrice: number;
  shares: number;
  method: "CAP" | "DISCOUNT" | "ROUND_PRICE";
  effectiveDiscountPct: number; // vs round price
  capPrice: number | null;
  discountPrice: number | null;
}

export function accruedInterest(c: ConvertibleInput, asOf: Date): number {
  if (c.type !== "CONVERTIBLE_NOTE" || !c.interestRate || !c.issueDate) return 0;
  const issued = typeof c.issueDate === "string" ? new Date(c.issueDate) : c.issueDate;
  const years = Math.max(0, differenceInDays(asOf, issued)) / 365;
  if (c.interestType === "COMPOUND") return c.principal * (Math.pow(1 + c.interestRate / 100, years) - 1);
  return c.principal * (c.interestRate / 100) * years;
}

export interface SolveConversionsInput {
  convertibles: ConvertibleInput[];
  /** Fully diluted shares before the round, excluding convertibles and excluding pool top-up. */
  preRoundFullyDiluted: number;
  /** Additional pool shares created as part of the round (pre-money top-up). */
  poolIncrease: number;
  /** Round price per share. If omitted, derived from preMoney / (preRoundFullyDiluted + poolIncrease + converted shares). */
  roundPricePerShare?: number;
  preMoneyValuation?: number;
  asOf?: Date;
  /** MFN: apply the best cap/discount among later SAFEs to MFN SAFEs. */
  applyMfn?: boolean;
}

export interface SolveConversionsResult {
  results: ConversionResult[];
  roundPricePerShare: number;
  totalConvertedShares: number;
  iterations: number;
}

export function solveConversions(input: SolveConversionsInput): SolveConversionsResult {
  const asOf = input.asOf ?? new Date();
  let convertibles = input.convertibles.map((c) => ({ ...c }));

  if (input.applyMfn) {
    const bestCap = Math.min(...convertibles.filter((c) => c.valuationCap).map((c) => c.valuationCap as number), Infinity);
    const bestDiscount = Math.max(...convertibles.map((c) => c.discountPercent ?? 0), 0);
    convertibles = convertibles.map((c) =>
      c.mfn
        ? {
            ...c,
            valuationCap: Number.isFinite(bestCap) ? Math.min(c.valuationCap ?? Infinity, bestCap) : c.valuationCap,
            discountPercent: Math.max(c.discountPercent ?? 0, bestDiscount) || null,
          }
        : c,
    );
  }

  const base = input.preRoundFullyDiluted + input.poolIncrease;
  let converted = new Map<string, number>(convertibles.map((c) => [c.id, 0]));
  let pps = input.roundPricePerShare ?? (input.preMoneyValuation ? input.preMoneyValuation / base : 0);
  let iterations = 0;
  let results: ConversionResult[] = [];

  for (iterations = 0; iterations < 200; iterations++) {
    const totalConverted = [...converted.values()].reduce((a, b) => a + b, 0);
    if (!input.roundPricePerShare && input.preMoneyValuation) {
      pps = input.preMoneyValuation / (base + totalConverted);
    }
    const next = new Map<string, number>();
    results = convertibles.map((c) => {
      const interest = accruedInterest(c, asOf);
      const amount = c.principal + interest;
      let capPrice: number | null = null;
      if (c.valuationCap) {
        const isPostMoney = c.type === "SAFE" && (c.safeType ?? "POST_MONEY") === "POST_MONEY";
        // Post-money SAFE capitalization includes every converting instrument; pre-money instruments
        // and notes use pre-money fully diluted (excluding convertibles).
        const capitalization = isPostMoney ? base + totalConverted : base;
        capPrice = c.valuationCap / capitalization;
      }
      const discountPrice = c.discountPercent && pps > 0 ? pps * (1 - c.discountPercent / 100) : null;
      const candidates: { price: number; method: ConversionResult["method"] }[] = [];
      if (capPrice) candidates.push({ price: capPrice, method: "CAP" });
      if (discountPrice) candidates.push({ price: discountPrice, method: "DISCOUNT" });
      if (pps > 0) candidates.push({ price: pps, method: "ROUND_PRICE" });
      const best = candidates.length ? candidates.reduce((a, b) => (b.price < a.price ? b : a)) : { price: 0, method: "ROUND_PRICE" as const };
      const shares = best.price > 0 ? Math.floor(amount / best.price) : 0;
      next.set(c.id, shares);
      return {
        id: c.id,
        stakeholderId: c.stakeholderId,
        principal: c.principal,
        accruedInterest: interest,
        amount,
        conversionPrice: best.price,
        shares,
        method: best.method,
        effectiveDiscountPct: pps > 0 && best.price > 0 ? (1 - best.price / pps) * 100 : 0,
        capPrice,
        discountPrice,
      };
    });
    let delta = 0;
    for (const [id, v] of next) delta += Math.abs(v - (converted.get(id) ?? 0));
    converted = next;
    if (delta < 1) break;
  }

  return {
    results,
    roundPricePerShare: pps,
    totalConvertedShares: [...converted.values()].reduce((a, b) => a + b, 0),
    iterations,
  };
}

/** Quick single-instrument preview at a hypothetical priced round (no cross-SAFE effects). */
export function previewConversion(
  c: ConvertibleInput,
  preMoneyValuation: number,
  preRoundFullyDiluted: number,
  asOf = new Date(),
): ConversionResult {
  return solveConversions({ convertibles: [c], preRoundFullyDiluted, poolIncrease: 0, preMoneyValuation, asOf }).results[0];
}
