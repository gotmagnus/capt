/**
 * Exercise simulator — estimates only. Uses 2025 US federal figures; the UI labels
 * every output as an estimate and not tax advice.
 */

export type FilingStatus = "SINGLE" | "MARRIED_JOINT" | "HEAD_OF_HOUSEHOLD";

const BRACKETS_2025: Record<FilingStatus, [number, number][]> = {
  SINGLE: [
    [11_925, 0.1],
    [48_475, 0.12],
    [103_350, 0.22],
    [197_300, 0.24],
    [250_525, 0.32],
    [626_350, 0.35],
    [Infinity, 0.37],
  ],
  MARRIED_JOINT: [
    [23_850, 0.1],
    [96_950, 0.12],
    [206_700, 0.22],
    [394_600, 0.24],
    [501_050, 0.32],
    [751_600, 0.35],
    [Infinity, 0.37],
  ],
  HEAD_OF_HOUSEHOLD: [
    [17_000, 0.1],
    [64_850, 0.12],
    [103_350, 0.22],
    [197_300, 0.24],
    [250_500, 0.32],
    [626_350, 0.35],
    [Infinity, 0.37],
  ],
};

const STANDARD_DEDUCTION_2025: Record<FilingStatus, number> = { SINGLE: 15_000, MARRIED_JOINT: 30_000, HEAD_OF_HOUSEHOLD: 22_500 };
const AMT_EXEMPTION_2025: Record<FilingStatus, { exemption: number; phaseOutStart: number }> = {
  SINGLE: { exemption: 88_100, phaseOutStart: 626_350 },
  MARRIED_JOINT: { exemption: 137_000, phaseOutStart: 1_252_700 },
  HEAD_OF_HOUSEHOLD: { exemption: 88_100, phaseOutStart: 626_350 },
};
const AMT_28_THRESHOLD_2025: Record<FilingStatus, number> = { SINGLE: 239_100, MARRIED_JOINT: 239_100, HEAD_OF_HOUSEHOLD: 239_100 };
const SS_WAGE_BASE_2025 = 176_100;
const SUPPLEMENTAL_RATE = 0.22;
const SUPPLEMENTAL_RATE_HIGH = 0.37;

export function regularTax(taxableIncome: number, status: FilingStatus) {
  let tax = 0;
  let prev = 0;
  for (const [cap, rate] of BRACKETS_2025[status]) {
    if (taxableIncome <= prev) break;
    const slice = Math.min(taxableIncome, cap) - prev;
    tax += slice * rate;
    prev = cap;
  }
  return tax;
}

export function tentativeMinimumTax(amti: number, status: FilingStatus) {
  const { exemption, phaseOutStart } = AMT_EXEMPTION_2025[status];
  const reducedExemption = Math.max(0, exemption - Math.max(0, amti - phaseOutStart) * 0.25);
  const base = Math.max(0, amti - reducedExemption);
  const threshold = AMT_28_THRESHOLD_2025[status];
  return base <= threshold ? base * 0.26 : threshold * 0.26 + (base - threshold) * 0.28;
}

export interface ExerciseSimulationInput {
  type: "OPTION_ISO" | "OPTION_NSO" | string;
  quantity: number;
  exercisePrice: number;
  fmv: number;
  filingStatus?: FilingStatus;
  otherIncome?: number; // wages etc. for the year
  ytdWages?: number; // for Social Security wage base
  stateRate?: number; // 0.093 for CA etc.
  grantDate?: Date | null;
  exerciseDate?: Date;
}

export interface ExerciseSimulationResult {
  quantity: number;
  exerciseCost: number;
  spread: number;
  fmvValue: number;
  ordinaryIncome: number;
  federalWithholding: number;
  socialSecurity: number;
  medicare: number;
  stateWithholding: number;
  totalWithholding: number;
  amtEstimate: number;
  estimatedTaxes: number;
  totalCashRequired: number;
  isoQualifyingDate: Date | null; // later of grant+2y and exercise+1y
  notes: string[];
}

export function simulateExercise(i: ExerciseSimulationInput): ExerciseSimulationResult {
  const status = i.filingStatus ?? "SINGLE";
  const qty = Math.max(0, i.quantity);
  const cost = qty * i.exercisePrice;
  const fmvValue = qty * i.fmv;
  const spread = Math.max(0, fmvValue - cost);
  const otherIncome = i.otherIncome ?? 0;
  const notes: string[] = [];
  const exerciseDate = i.exerciseDate ?? new Date();

  let ordinaryIncome = 0;
  let federalWithholding = 0;
  let socialSecurity = 0;
  let medicare = 0;
  let stateWithholding = 0;
  let amtEstimate = 0;
  let isoQualifyingDate: Date | null = null;

  if (i.type === "OPTION_NSO") {
    ordinaryIncome = spread;
    const supplementalOverMillion = Math.max(0, otherIncome + spread - 1_000_000);
    federalWithholding = (spread - Math.min(spread, supplementalOverMillion)) * SUPPLEMENTAL_RATE + Math.min(spread, supplementalOverMillion) * SUPPLEMENTAL_RATE_HIGH;
    const ytd = i.ytdWages ?? otherIncome;
    const ssRoom = Math.max(0, SS_WAGE_BASE_2025 - ytd);
    socialSecurity = Math.min(spread, ssRoom) * 0.062;
    medicare = spread * 0.0145 + Math.max(0, otherIncome + spread - 200_000) * 0.009;
    stateWithholding = spread * (i.stateRate ?? 0);
    notes.push("NSO spread is taxed as ordinary income at exercise and reported on your W-2.");
  } else {
    // ISO: no regular income tax at exercise; spread is an AMT preference item.
    const taxable = Math.max(0, otherIncome - STANDARD_DEDUCTION_2025[status]);
    const regular = regularTax(taxable, status);
    const tmt = tentativeMinimumTax(otherIncome + spread, status);
    amtEstimate = Math.max(0, tmt - regular);
    stateWithholding = 0;
    if (i.grantDate) {
      const twoYears = new Date(i.grantDate);
      twoYears.setFullYear(twoYears.getFullYear() + 2);
      const oneYear = new Date(exerciseDate);
      oneYear.setFullYear(oneYear.getFullYear() + 1);
      isoQualifyingDate = twoYears > oneYear ? twoYears : oneYear;
    }
    notes.push("ISO exercises are not subject to withholding; the spread may trigger Alternative Minimum Tax.");
    if (amtEstimate > 0) notes.push("AMT paid can generate a credit usable in future years.");
    notes.push("Hold shares 2 years from grant and 1 year from exercise for long-term capital gains treatment.");
  }

  const totalWithholding = federalWithholding + socialSecurity + medicare + stateWithholding;
  return {
    quantity: qty,
    exerciseCost: cost,
    spread,
    fmvValue,
    ordinaryIncome,
    federalWithholding,
    socialSecurity,
    medicare,
    stateWithholding,
    totalWithholding,
    amtEstimate,
    estimatedTaxes: totalWithholding + amtEstimate,
    totalCashRequired: cost + totalWithholding,
    isoQualifyingDate,
    notes,
  };
}

/** Value of a grant at a set of hypothetical exit prices, for offer letters / total comp. */
export function grantValueProjection(quantity: number, exercisePrice: number, currentFmv: number, multiples = [1, 2, 5, 10]) {
  return multiples.map((m) => {
    const pps = currentFmv * m;
    return { multiple: m, pricePerShare: pps, grossValue: quantity * pps, netValue: Math.max(0, quantity * (pps - exercisePrice)) };
  });
}
