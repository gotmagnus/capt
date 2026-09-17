import { addDays, differenceInDays, isAfter, isBefore, subMonths } from "date-fns";
import { cappedVestingEvents, type VestingScheduleInput } from "./vesting";

// ---------------------------------------------------------------------------
// Rule 701 — 12-month compensatory issuance limit
// ---------------------------------------------------------------------------

export interface Rule701Sale {
  securityId: string;
  stakeholderName: string;
  type: string;
  date: Date;
  quantity: number;
  /** For options: exercise price × shares. RSUs/RSAs: FMV at grant × shares. */
  aggregateSalesPrice: number;
}

export interface Rule701Result {
  asOf: Date;
  windowStart: Date;
  totalSalesPrice: number;
  limitOneMillion: number;
  limitAssets: number | null;
  limitOutstanding: number | null;
  applicableLimit: number;
  utilizationPct: number;
  enhancedDisclosureThreshold: number;
  requiresEnhancedDisclosure: boolean;
  headroom: number;
  status: "OK" | "WARNING" | "EXCEEDED";
  sales: Rule701Sale[];
}

export function rule701Check(input: {
  sales: Rule701Sale[];
  asOf?: Date;
  totalAssets?: number | null;
  outstandingSharesValue?: number | null; // outstanding shares × FMV (15% test basis)
}): Rule701Result {
  const asOf = input.asOf ?? new Date();
  const windowStart = subMonths(asOf, 12);
  const sales = input.sales.filter((s) => !isBefore(s.date, windowStart) && !isAfter(s.date, asOf));
  const total = sales.reduce((a, s) => a + s.aggregateSalesPrice, 0);
  const limitAssets = input.totalAssets ? input.totalAssets * 0.15 : null;
  const limitOutstanding = input.outstandingSharesValue ? input.outstandingSharesValue * 0.15 : null;
  const applicable = Math.max(1_000_000, limitAssets ?? 0, limitOutstanding ?? 0);
  const utilization = total / applicable;
  return {
    asOf,
    windowStart,
    totalSalesPrice: total,
    limitOneMillion: 1_000_000,
    limitAssets,
    limitOutstanding,
    applicableLimit: applicable,
    utilizationPct: utilization,
    enhancedDisclosureThreshold: 10_000_000,
    requiresEnhancedDisclosure: total > 10_000_000,
    headroom: Math.max(0, applicable - total),
    status: utilization >= 1 ? "EXCEEDED" : utilization >= 0.8 ? "WARNING" : "OK",
    sales: sales.sort((a, b) => b.date.getTime() - a.date.getTime()),
  };
}

// ---------------------------------------------------------------------------
// ISO $100,000 limit (IRC §422(d))
// ---------------------------------------------------------------------------

export interface IsoGrantForLimit {
  securityId: string;
  stakeholderId: string;
  stakeholderName: string;
  grantDate: Date;
  vestingStart: Date;
  /** As granted. Pass `cancelled` separately so forfeited shares cap the schedule instead of rescaling it. */
  quantity: number;
  cancelled?: number;
  fmvAtGrant: number;
  schedule: VestingScheduleInput | null;
}

export interface IsoLimitYear {
  year: number;
  firstExercisableValue: number;
  isoQualified: number; // shares
  excessShares: number; // treated as NSO
  grants: { securityId: string; shares: number; value: number; excessShares: number }[];
}

export interface IsoLimitResult {
  stakeholderId: string;
  stakeholderName: string;
  years: IsoLimitYear[];
  totalExcessShares: number;
  hasExcess: boolean;
}

export function isoLimitCheck(grants: IsoGrantForLimit[]): IsoLimitResult[] {
  const byHolder = new Map<string, IsoGrantForLimit[]>();
  for (const g of grants) {
    const arr = byHolder.get(g.stakeholderId) ?? [];
    arr.push(g);
    byHolder.set(g.stakeholderId, arr);
  }
  const out: IsoLimitResult[] = [];
  for (const [stakeholderId, list] of byHolder) {
    const years = new Map<number, IsoLimitYear>();
    // grants are applied in grant-date order; the excess falls on the latest grants
    const ordered = list.slice().sort((a, b) => a.grantDate.getTime() - b.grantDate.getTime());
    for (const g of ordered) {
      const live = Math.max(0, g.quantity - (g.cancelled ?? 0));
      const events = g.schedule ? cappedVestingEvents(g.quantity, g.vestingStart, g.schedule, g.cancelled ?? 0) : [{ date: g.vestingStart, amount: live, cumulative: live }];
      for (const e of events) {
        const y = e.date.getFullYear();
        const yr = years.get(y) ?? { year: y, firstExercisableValue: 0, isoQualified: 0, excessShares: 0, grants: [] };
        const value = e.amount * g.fmvAtGrant;
        const room = Math.max(0, 100_000 - yr.firstExercisableValue);
        // Only divide when the tranche is actually cut by the limit: value / fmv on an uncapped
        // tranche can land a hair under the share count and floor() then invents one excess share.
        const qualifiedShares = value <= room || g.fmvAtGrant <= 0 ? e.amount : Math.floor(room / g.fmvAtGrant + 1e-9);
        const excess = e.amount - qualifiedShares;
        yr.firstExercisableValue += value;
        yr.isoQualified += qualifiedShares;
        yr.excessShares += excess;
        const gr = yr.grants.find((x) => x.securityId === g.securityId);
        if (gr) {
          gr.shares += e.amount;
          gr.value += value;
          gr.excessShares += excess;
        } else yr.grants.push({ securityId: g.securityId, shares: e.amount, value, excessShares: excess });
        years.set(y, yr);
      }
    }
    const yearList = [...years.values()].sort((a, b) => a.year - b.year);
    const totalExcess = yearList.reduce((a, y) => a + y.excessShares, 0);
    out.push({ stakeholderId, stakeholderName: list[0].stakeholderName, years: yearList, totalExcessShares: totalExcess, hasExcess: totalExcess > 0 });
  }
  return out.sort((a, b) => b.totalExcessShares - a.totalExcessShares);
}

// ---------------------------------------------------------------------------
// 83(b) elections — 30 days from the transfer of restricted property
// ---------------------------------------------------------------------------

export interface Election83bItem {
  securityId: string;
  certificateNumber: string;
  stakeholderName: string;
  type: string;
  issueDate: Date;
  deadline: Date;
  filedDate: Date | null;
  daysRemaining: number;
  status: "FILED" | "DUE" | "OVERDUE" | "MISSED";
}

export function election83bStatus(items: { securityId: string; certificateNumber: string; stakeholderName: string; type: string; issueDate: Date; filedDate?: Date | null; deadline?: Date | null }[], asOf = new Date()): Election83bItem[] {
  return items.map((i) => {
    const deadline = i.deadline ?? addDays(i.issueDate, 30);
    const daysRemaining = differenceInDays(deadline, asOf);
    let status: Election83bItem["status"];
    if (i.filedDate) status = "FILED";
    else if (daysRemaining < -30) status = "MISSED";
    else if (daysRemaining < 0) status = "OVERDUE";
    else status = "DUE";
    return { ...i, filedDate: i.filedDate ?? null, deadline, daysRemaining, status };
  }).sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}

// ---------------------------------------------------------------------------
// Form 3921 — ISO exercise reporting
// ---------------------------------------------------------------------------

export interface Form3921Record {
  exerciseId: string;
  taxYear: number;
  employeeName: string;
  employeeAddress: string | null;
  employeeTin: string | null;
  grantDate: Date;
  exerciseDate: Date;
  exercisePricePerShare: number;
  fmvPerShareOnExercise: number;
  sharesTransferred: number;
  spread: number;
  copyBDueDate: Date; // to employee: Jan 31
  copyADueDate: Date; // to IRS: Feb 28 paper / Mar 31 electronic
}

export function buildForm3921Records(
  exercises: { id: string; employeeName: string; address?: string | null; tin?: string | null; grantDate: Date; exerciseDate: Date; exercisePrice: number; fmv: number; shares: number; isIso: boolean }[],
): Form3921Record[] {
  return exercises
    .filter((e) => e.isIso)
    .map((e) => {
      const taxYear = e.exerciseDate.getFullYear();
      return {
        exerciseId: e.id,
        taxYear,
        employeeName: e.employeeName,
        employeeAddress: e.address ?? null,
        employeeTin: e.tin ?? null,
        grantDate: e.grantDate,
        exerciseDate: e.exerciseDate,
        exercisePricePerShare: e.exercisePrice,
        fmvPerShareOnExercise: e.fmv,
        sharesTransferred: e.shares,
        spread: (e.fmv - e.exercisePrice) * e.shares,
        copyBDueDate: new Date(taxYear + 1, 0, 31),
        copyADueDate: new Date(taxYear + 1, 2, 31),
      };
    })
    .sort((a, b) => b.exerciseDate.getTime() - a.exerciseDate.getTime());
}

// ---------------------------------------------------------------------------
// 409A freshness
// ---------------------------------------------------------------------------

export function valuationFreshness(valuationDate: Date | null, asOf = new Date()) {
  if (!valuationDate) return { status: "MISSING" as const, daysRemaining: 0, expiresOn: null };
  const expiresOn = addDays(valuationDate, 365);
  const daysRemaining = differenceInDays(expiresOn, asOf);
  const status = daysRemaining < 0 ? ("EXPIRED" as const) : daysRemaining <= 60 ? ("EXPIRING" as const) : ("CURRENT" as const);
  return { status, daysRemaining, expiresOn };
}
