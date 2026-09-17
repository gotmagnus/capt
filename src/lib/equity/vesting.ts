import { addDays, addMonths, differenceInDays, isAfter, isBefore, min as minDate } from "date-fns";

export type VestingFrequency = "MONTHLY" | "QUARTERLY" | "ANNUALLY" | "DAILY";
export type VestingType = "TIME" | "MILESTONE" | "HYBRID" | "IMMEDIATE" | "CUSTOM";

export interface VestingScheduleInput {
  type: VestingType | string;
  totalMonths: number;
  cliffMonths: number;
  cliffPercent?: number | null;
  frequency: VestingFrequency | string;
  accelerationSingleTrigger?: number;
  accelerationDoubleTrigger?: number;
  milestones?: { percent: number; achievedAt?: Date | string | null; description?: string }[];
}

export interface VestingEvent {
  date: Date;
  amount: number;
  cumulative: number;
  label?: string;
}

export interface VestingResult {
  total: number;
  vested: number;
  unvested: number;
  forfeited: number;
  percentVested: number;
  cliffDate: Date | null;
  cliffReached: boolean;
  nextVestDate: Date | null;
  nextVestAmount: number;
  fullyVestedDate: Date | null;
  events: VestingEvent[];
  terminated: boolean;
}

const MONTHS_PER_PERIOD: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, ANNUALLY: 12 };

function toDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(x.getTime()) ? null : x;
}

/**
 * Builds the full vesting event timeline for a grant. Shares vest in whole units;
 * rounding remainders roll forward so the final tranche completes the grant.
 */
export function buildVestingEvents(
  quantity: number,
  vestingStart: Date,
  schedule: VestingScheduleInput,
): VestingEvent[] {
  const events: VestingEvent[] = [];
  const type = schedule.type;

  if (type === "IMMEDIATE" || quantity <= 0) {
    return [{ date: vestingStart, amount: quantity, cumulative: quantity, label: "Fully vested at grant" }];
  }

  if (type === "MILESTONE") {
    let cumulative = 0;
    for (const m of schedule.milestones ?? []) {
      const achieved = toDate(m.achievedAt);
      if (!achieved) continue;
      const amount = Math.floor((quantity * m.percent) / 100);
      cumulative += amount;
      events.push({ date: achieved, amount, cumulative, label: m.description });
    }
    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  const totalMonths = Math.max(1, schedule.totalMonths);
  const cliffMonths = Math.max(0, Math.min(schedule.cliffMonths, totalMonths));

  if (schedule.frequency === "DAILY") {
    const end = addMonths(vestingStart, totalMonths);
    const totalDays = Math.max(1, differenceInDays(end, vestingStart));
    const cliffDate = addMonths(vestingStart, cliffMonths);
    const cliffDays = differenceInDays(cliffDate, vestingStart);
    let cumulative = 0;
    for (let d = 1; d <= totalDays; d++) {
      if (d < cliffDays) continue;
      const target = Math.floor((quantity * d) / totalDays);
      const amount = target - cumulative;
      if (amount <= 0 && d !== totalDays) continue;
      cumulative = target;
      events.push({ date: addDays(vestingStart, d), amount, cumulative, label: d === cliffDays ? "Cliff" : undefined });
    }
    return events;
  }

  const monthsPerPeriod = MONTHS_PER_PERIOD[schedule.frequency] ?? 1;
  const periods = Math.ceil(totalMonths / monthsPerPeriod);
  let cumulative = 0;
  for (let i = 1; i <= periods; i++) {
    const monthsElapsed = Math.min(totalMonths, i * monthsPerPeriod);
    if (monthsElapsed < cliffMonths) continue;
    let target: number;
    if (monthsElapsed === cliffMonths && schedule.cliffPercent != null && schedule.cliffPercent > 0) {
      target = Math.floor((quantity * schedule.cliffPercent) / 100);
    } else {
      target = Math.floor((quantity * monthsElapsed) / totalMonths);
    }
    if (i === periods) target = quantity;
    const amount = target - cumulative;
    if (amount <= 0) continue;
    cumulative = target;
    events.push({
      date: addMonths(vestingStart, monthsElapsed),
      amount,
      cumulative,
      label: monthsElapsed === cliffMonths && cliffMonths > 0 ? "Cliff" : undefined,
    });
  }
  // A cliff that doesn't fall on a period boundary (e.g. 12-month cliff with quarterly vesting is fine,
  // but a 5-month cliff with quarterly vesting is not) is handled by inserting the cliff tranche.
  if (cliffMonths > 0 && !events.some((e) => e.label === "Cliff")) {
    const cliffDate = addMonths(vestingStart, cliffMonths);
    const target = schedule.cliffPercent
      ? Math.floor((quantity * schedule.cliffPercent) / 100)
      : Math.floor((quantity * cliffMonths) / totalMonths);
    const filtered = events.filter((e) => isAfter(e.date, cliffDate));
    const rebuilt: VestingEvent[] = [{ date: cliffDate, amount: target, cumulative: target, label: "Cliff" }];
    let cum = target;
    for (const e of filtered) {
      const amt = e.cumulative - cum;
      if (amt <= 0) continue;
      cum = e.cumulative;
      rebuilt.push({ ...e, amount: amt });
    }
    return rebuilt;
  }
  return events;
}

/**
 * Vesting events for a grant that has had shares cancelled. The schedule always runs over the
 * grant as issued; cancelled shares come off the unvested tail (forfeiture on termination,
 * repurchase of unvested stock), so they cap what can vest. Re-running the schedule over the
 * reduced quantity would forfeit those shares a second time.
 */
export function cappedVestingEvents(quantity: number, start: Date, schedule: VestingScheduleInput, cancelled = 0): VestingEvent[] {
  const cap = Math.max(0, quantity - cancelled);
  const events: VestingEvent[] = [];
  for (const e of buildVestingEvents(quantity, start, schedule)) {
    const prev = events.length ? events[events.length - 1].cumulative : 0;
    const cumulative = Math.min(e.cumulative, cap);
    if (cumulative > prev) events.push({ ...e, amount: cumulative - prev, cumulative });
    if (cumulative >= cap) break;
  }
  return events;
}

export interface ComputeVestingOptions {
  asOf?: Date;
  terminationDate?: Date | string | null;
  /** Shares already exercised/settled; only affects `unvested`/`vested` reporting when exercised > vested (early exercise). */
  exercised?: number;
  cancelled?: number;
  /** Discretionary acceleration recorded against the grant (e.g. on a change of control or termination). */
  accelerated?: { shares: number; at?: Date | string | null } | null;
}

export function computeVesting(
  quantity: number,
  vestingStart: Date | string | null | undefined,
  schedule: VestingScheduleInput | null | undefined,
  options: ComputeVestingOptions = {},
): VestingResult {
  const asOf = options.asOf ?? new Date();
  const start = toDate(vestingStart);
  const termination = toDate(options.terminationDate);
  const cancelled = options.cancelled ?? 0;
  const effectiveQuantity = Math.max(0, quantity - cancelled);

  if (!schedule || !start) {
    return {
      total: effectiveQuantity,
      vested: effectiveQuantity,
      unvested: 0,
      forfeited: 0,
      percentVested: effectiveQuantity > 0 ? 1 : 0,
      cliffDate: null,
      cliffReached: true,
      nextVestDate: null,
      nextVestAmount: 0,
      fullyVestedDate: start,
      events: start ? [{ date: start, amount: effectiveQuantity, cumulative: effectiveQuantity }] : [],
      terminated: false,
    };
  }

  const events = cappedVestingEvents(quantity, start, schedule, cancelled);
  const cutoff = termination ? minDate([asOf, termination]) : asOf;
  let vested = 0;
  let nextVestDate: Date | null = null;
  let nextVestAmount = 0;
  for (const e of events) {
    if (!isAfter(e.date, cutoff)) {
      vested = e.cumulative;
    } else if (!nextVestDate && (!termination || isBefore(e.date, termination) || e.date.getTime() === termination.getTime())) {
      nextVestDate = e.date;
      nextVestAmount = e.amount;
    }
  }
  const terminated = !!termination && !isAfter(termination, asOf);
  let forfeited = terminated ? effectiveQuantity - vested : 0;
  let unvested = effectiveQuantity - vested - forfeited;
  const acc = options.accelerated;
  const accAt = toDate(acc?.at);
  if (acc && acc.shares > 0 && (!accAt || !isAfter(accAt, asOf))) {
    const add = Math.min(unvested + forfeited, acc.shares);
    const fromUnvested = Math.min(unvested, add);
    unvested -= fromUnvested;
    forfeited -= add - fromUnvested;
    vested += add;
  }
  const cliffDate = schedule.cliffMonths > 0 && schedule.type !== "IMMEDIATE" && schedule.type !== "MILESTONE"
    ? addMonths(start, schedule.cliffMonths)
    : null;
  const fullyVestedDate = events.length ? events[events.length - 1].date : start;

  return {
    total: effectiveQuantity,
    vested,
    unvested,
    forfeited,
    percentVested: effectiveQuantity > 0 ? vested / effectiveQuantity : 0,
    cliffDate,
    cliffReached: !cliffDate || !isAfter(cliffDate, cutoff),
    nextVestDate: terminated ? null : nextVestDate,
    nextVestAmount: terminated ? 0 : nextVestAmount,
    fullyVestedDate,
    events,
    terminated,
  };
}

/** Shares that would vest under acceleration on a change of control. */
export function acceleratedShares(
  unvested: number,
  schedule: Pick<VestingScheduleInput, "accelerationSingleTrigger" | "accelerationDoubleTrigger"> | null | undefined,
  trigger: "SINGLE" | "DOUBLE",
) {
  if (!schedule) return 0;
  const pct = trigger === "SINGLE" ? schedule.accelerationSingleTrigger ?? 0 : schedule.accelerationDoubleTrigger ?? 0;
  return Math.floor((unvested * pct) / 100);
}

/** Aggregates monthly vesting across many grants for charts and forecasts. */
export function vestingForecast(
  grants: { quantity: number; vestingStart: Date | string | null | undefined; schedule: VestingScheduleInput | null | undefined; terminationDate?: Date | string | null }[],
  from: Date,
  months: number,
): { month: string; date: Date; vesting: number; cumulative: number }[] {
  const buckets = new Map<string, number>();
  for (const g of grants) {
    const start = toDate(g.vestingStart);
    if (!start || !g.schedule) continue;
    const termination = toDate(g.terminationDate);
    for (const e of buildVestingEvents(g.quantity, start, g.schedule)) {
      if (termination && isAfter(e.date, termination)) break;
      const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, (buckets.get(key) ?? 0) + e.amount);
    }
  }
  const out: { month: string; date: Date; vesting: number; cumulative: number }[] = [];
  let cumulative = 0;
  for (let i = 0; i < months; i++) {
    const d = addMonths(new Date(from.getFullYear(), from.getMonth(), 1), i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const vesting = buckets.get(key) ?? 0;
    cumulative += vesting;
    out.push({ month: key, date: d, vesting, cumulative });
  }
  return out;
}
