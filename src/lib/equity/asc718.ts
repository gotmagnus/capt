import { addMonths, differenceInCalendarMonths, isAfter, isBefore, max as maxDate, min as minDate } from "date-fns";
import { buildVestingEvents, type VestingScheduleInput } from "./vesting";

/** Standard normal CDF (Abramowitz & Stegun 7.1.26). */
export function normCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export interface BlackScholesInput {
  stockPrice: number; // FMV at grant
  strike: number;
  expectedTermYears: number;
  volatility: number; // 0.55 = 55%
  riskFreeRate: number; // 0.04 = 4%
  dividendYield?: number;
}

export function blackScholes(i: BlackScholesInput) {
  const { stockPrice: S, strike: K, expectedTermYears: T, volatility: v, riskFreeRate: r } = i;
  const q = i.dividendYield ?? 0;
  if (T <= 0 || v <= 0) return Math.max(0, S - K);
  const d1 = (Math.log(S / K) + (r - q + (v * v) / 2) * T) / (v * Math.sqrt(T));
  const d2 = d1 - v * Math.sqrt(T);
  return S * Math.exp(-q * T) * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
}

/** SAB 107 / Topic 14 "simplified method" expected term. */
export function simplifiedExpectedTerm(vestingMonths: number, contractualYears = 10, cliffMonths = 12) {
  // average of the vesting midpoint and contractual term; approximates the SEC formula for graded schedules
  const midpointVestYears = ((cliffMonths + vestingMonths) / 2) / 12;
  return (midpointVestYears + contractualYears) / 2;
}

export interface ExpenseGrant {
  id: string;
  stakeholderId: string;
  stakeholderName: string;
  department?: string | null;
  type: string; // OPTION_ISO | OPTION_NSO | RSU | RSA
  quantity: number;
  grantDate: Date;
  vestingStart: Date;
  schedule: VestingScheduleInput | null;
  strike?: number | null;
  fmvAtGrant: number;
  terminationDate?: Date | null;
  cancelledQuantity?: number;
  volatility?: number;
  riskFreeRate?: number;
  contractualYears?: number;
}

export interface GrantExpense {
  grantId: string;
  stakeholderId: string;
  stakeholderName: string;
  department: string | null;
  type: string;
  quantity: number;
  fairValuePerShare: number;
  totalFairValue: number;
  expectedTerm: number;
  volatility: number;
  riskFreeRate: number;
  byPeriod: Record<string, number>; // "YYYY-MM" => expense
  recognizedToDate: number;
  unrecognized: number;
  forfeited: number;
  remainingMonths: number;
}

export interface ExpenseReport {
  method: "STRAIGHT_LINE" | "GRADED";
  periodStart: Date;
  periodEnd: Date;
  grants: GrantExpense[];
  periodExpense: number;
  cumulativeExpense: number;
  unrecognized: number;
  byMonth: { month: string; expense: number }[];
  byDepartment: { department: string; expense: number }[];
  byType: { type: string; expense: number }[];
  assumptions: { volatility: number; riskFreeRate: number; forfeitureRate: number };
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Attributes fair value over the requisite service period.
 * - STRAIGHT_LINE: total fair value evenly over the full vesting period (floor: expense >= vested value).
 * - GRADED (FIN 28): each vesting tranche is a separate award expensed over its own period.
 */
export function computeExpense(
  grants: ExpenseGrant[],
  periodStart: Date,
  periodEnd: Date,
  options: { method?: "STRAIGHT_LINE" | "GRADED"; volatility?: number; riskFreeRate?: number; forfeitureRate?: number } = {},
): ExpenseReport {
  const method = options.method ?? "STRAIGHT_LINE";
  const vol = options.volatility ?? 0.55;
  const rf = options.riskFreeRate ?? 0.04;
  const forfeitureRate = options.forfeitureRate ?? 0;

  const results: GrantExpense[] = grants.map((g) => {
    const schedule = g.schedule ?? { type: "IMMEDIATE", totalMonths: 0, cliffMonths: 0, frequency: "MONTHLY" };
    const totalMonths = schedule.type === "IMMEDIATE" ? 0 : Math.max(1, schedule.totalMonths);
    const expectedTerm = g.type.startsWith("OPTION")
      ? simplifiedExpectedTerm(totalMonths, g.contractualYears ?? 10, schedule.cliffMonths)
      : 0;
    const fairValuePerShare = g.type.startsWith("OPTION")
      ? blackScholes({ stockPrice: g.fmvAtGrant, strike: g.strike ?? g.fmvAtGrant, expectedTermYears: expectedTerm, volatility: g.volatility ?? vol, riskFreeRate: g.riskFreeRate ?? rf })
      : g.fmvAtGrant;
    const liveQty = Math.max(0, g.quantity - (g.cancelledQuantity ?? 0));
    const totalFairValue = fairValuePerShare * liveQty * (1 - forfeitureRate);
    const byPeriod: Record<string, number> = {};
    const serviceEnd = g.terminationDate ?? null;

    const addExpense = (from: Date, to: Date, amount: number) => {
      // spread `amount` evenly across the calendar months between from and to
      const months = Math.max(1, differenceInCalendarMonths(to, from));
      const perMonth = amount / months;
      for (let m = 0; m < months; m++) {
        const d = addMonths(from, m);
        if (serviceEnd && isAfter(d, serviceEnd)) break;
        byPeriod[monthKey(d)] = (byPeriod[monthKey(d)] ?? 0) + perMonth;
      }
    };

    if (totalMonths === 0) {
      byPeriod[monthKey(g.grantDate)] = totalFairValue;
    } else if (method === "STRAIGHT_LINE") {
      addExpense(g.vestingStart, addMonths(g.vestingStart, totalMonths), totalFairValue);
    } else {
      const events = buildVestingEvents(liveQty, g.vestingStart, schedule);
      for (const e of events) {
        const trancheValue = fairValuePerShare * e.amount * (1 - forfeitureRate);
        addExpense(g.vestingStart, e.date, trancheValue);
      }
    }

    let recognizedToDate = 0;
    for (const [k, v] of Object.entries(byPeriod)) {
      const [y, m] = k.split("-").map(Number);
      const d = new Date(y, m - 1, 1);
      if (!isAfter(d, periodEnd)) recognizedToDate += v;
    }
    const forfeited = serviceEnd && !isAfter(serviceEnd, periodEnd) ? Math.max(0, totalFairValue - recognizedToDate) : 0;
    const remainingMonths = serviceEnd ? 0 : Math.max(0, differenceInCalendarMonths(addMonths(g.vestingStart, totalMonths), periodEnd));
    return {
      grantId: g.id,
      stakeholderId: g.stakeholderId,
      stakeholderName: g.stakeholderName,
      department: g.department ?? null,
      type: g.type,
      quantity: liveQty,
      fairValuePerShare,
      totalFairValue,
      expectedTerm,
      volatility: g.volatility ?? vol,
      riskFreeRate: g.riskFreeRate ?? rf,
      byPeriod: Object.fromEntries(Object.entries(byPeriod).filter(([k]) => {
        const [y, m] = k.split("-").map(Number);
        const d = new Date(y, m - 1, 1);
        return !isBefore(d, new Date(periodStart.getFullYear(), periodStart.getMonth(), 1)) && !isAfter(d, periodEnd);
      })),
      recognizedToDate,
      unrecognized: Math.max(0, totalFairValue - recognizedToDate - forfeited),
      forfeited,
      remainingMonths,
    };
  });

  const byMonthMap = new Map<string, number>();
  const byDeptMap = new Map<string, number>();
  const byTypeMap = new Map<string, number>();
  let periodExpense = 0;
  for (const r of results) {
    const grantPeriod = Object.values(r.byPeriod).reduce((a, b) => a + b, 0);
    periodExpense += grantPeriod;
    for (const [k, v] of Object.entries(r.byPeriod)) byMonthMap.set(k, (byMonthMap.get(k) ?? 0) + v);
    byDeptMap.set(r.department ?? "Unassigned", (byDeptMap.get(r.department ?? "Unassigned") ?? 0) + grantPeriod);
    byTypeMap.set(r.type, (byTypeMap.get(r.type) ?? 0) + grantPeriod);
  }
  const start = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
  const months = differenceInCalendarMonths(periodEnd, start) + 1;
  const byMonth = Array.from({ length: months }, (_, i) => {
    const k = monthKey(addMonths(start, i));
    return { month: k, expense: byMonthMap.get(k) ?? 0 };
  });

  return {
    method,
    periodStart: maxDate([start]),
    periodEnd: minDate([periodEnd]),
    grants: results,
    periodExpense,
    cumulativeExpense: results.reduce((a, r) => a + r.recognizedToDate, 0),
    unrecognized: results.reduce((a, r) => a + r.unrecognized, 0),
    byMonth,
    byDepartment: [...byDeptMap.entries()].map(([department, expense]) => ({ department, expense })).sort((a, b) => b.expense - a.expense),
    byType: [...byTypeMap.entries()].map(([type, expense]) => ({ type, expense })),
    assumptions: { volatility: vol, riskFreeRate: rf, forfeitureRate },
  };
}
