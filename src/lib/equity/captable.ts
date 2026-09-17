import { isAfter } from "date-fns";
import { computeVesting, type VestingScheduleInput } from "./vesting";
import { CONVERTIBLE_TYPES, EXERCISABLE_TYPES, SHARE_TYPES } from "../types";

// ---------------------------------------------------------------------------
// Input shapes: plain objects so the engine works with Prisma rows or JSON.
// ---------------------------------------------------------------------------

export interface ShareClassLike {
  id: string;
  name: string;
  prefix: string;
  type: string; // COMMON | PREFERRED
  authorizedShares: number;
  originalIssuePrice?: number | null;
  liquidationMultiple: number;
  participating: boolean;
  participationCap?: number | null;
  seniority: number;
  conversionRatio: number;
  dividendRate?: number | null;
  dividendType?: string;
}

export interface StakeholderLike {
  id: string;
  name: string;
  relationship: string;
  type?: string;
  email?: string | null;
  employmentStatus?: string | null;
  terminationDate?: Date | string | null;
  department?: string | null;
}

export interface EquityPlanLike {
  id: string;
  name: string;
  shareClassId: string;
  authorizedShares: number;
  status?: string;
}

export interface SecurityLike {
  id: string;
  type: string;
  status: string;
  certificateNumber: string;
  stakeholderId: string;
  shareClassId?: string | null;
  equityPlanId?: string | null;
  vestingScheduleId?: string | null;
  quantity: number;
  exercisedQuantity: number;
  cancelledQuantity: number;
  pricePerShare?: number | null;
  exercisePrice?: number | null;
  totalAmount?: number | null;
  issueDate: Date | string;
  vestingStartDate?: Date | string | null;
  valuationCap?: number | null;
  discountPercent?: number | null;
  safeType?: string | null;
  interestRate?: number | null;
  interestType?: string | null;
  maturityDate?: Date | string | null;
  mfn?: boolean;
  proRataRight?: boolean;
  fmvAtGrant?: number | null;
  grantDate?: Date | string | null;
  expirationDate?: Date | string | null;
  /** JSON: { acceleratedAt?: string; shares?: number } */
  accelerationOverride?: string | null;
}

function accelerationOf(s: SecurityLike): { shares: number; at?: string | null } | null {
  if (!s.accelerationOverride) return null;
  try {
    const o = JSON.parse(s.accelerationOverride) as { acceleratedAt?: string; shares?: number };
    return o?.shares && o.shares > 0 ? { shares: o.shares, at: o.acceleratedAt ?? null } : null;
  } catch {
    return null;
  }
}

export interface TransactionLike {
  id: string;
  type: string;
  securityId?: string | null;
  quantity: number;
  effectiveDate: Date | string;
}

export interface CapTableInput {
  shareClasses: ShareClassLike[];
  stakeholders: StakeholderLike[];
  equityPlans: EquityPlanLike[];
  securities: SecurityLike[];
  vestingSchedules?: Record<string, VestingScheduleInput>;
  transactions?: TransactionLike[];
  asOf?: Date;
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface CapTableRow {
  stakeholderId: string;
  name: string;
  relationship: string;
  byClass: Record<string, number>; // as-issued shares per class id
  commonShares: number;
  preferredShares: number; // as-converted
  optionsGranted: number;
  optionsOutstanding: number; // unexercised, uncancelled
  optionsVested: number;
  optionsExercisable: number; // vested & unexercised
  rsus: number;
  warrants: number;
  safePrincipal: number;
  notePrincipal: number;
  invested: number; // cash paid for shares + SAFEs + notes
  outstandingShares: number;
  outstandingPct: number;
  fullyDilutedShares: number;
  fullyDilutedPct: number;
  votingPct: number;
  securityIds: string[];
}

export interface ClassTotal {
  shareClassId: string;
  name: string;
  prefix: string;
  type: string;
  authorized: number;
  issued: number;
  asConverted: number;
  reservedForPlans: number;
  available: number;
  outstandingPct: number;
  fullyDilutedPct: number;
  liquidationPreference: number;
}

export interface PlanSummary {
  id: string;
  name: string;
  authorized: number;
  granted: number; // currently outstanding grants (unexercised + unvested)
  exercised: number;
  cancelled: number;
  available: number;
  utilizationPct: number;
}

export interface CapTableSummary {
  asOf: Date;
  rows: CapTableRow[];
  classTotals: ClassTotal[];
  plans: PlanSummary[];
  totals: {
    outstandingShares: number;
    fullyDilutedShares: number;
    commonOutstanding: number;
    preferredOutstanding: number;
    optionsOutstanding: number;
    optionsVested: number;
    rsus: number;
    warrants: number;
    poolAvailable: number;
    poolAuthorized: number;
    safeCount: number;
    safePrincipal: number;
    noteCount: number;
    notePrincipal: number;
    totalInvested: number;
    totalLiquidationPreference: number;
    stakeholderCount: number;
  };
  groups: { key: string; label: string; fullyDilutedShares: number; fullyDilutedPct: number; holders: number }[];
}

// ---------------------------------------------------------------------------

function toDate(d: Date | string) {
  return typeof d === "string" ? new Date(d) : d;
}

/**
 * Reconstructs a security's lifecycle as of a date. Without transactions the current
 * Prisma row values are used; with transactions, exercises/cancellations after `asOf`
 * are unwound so historical cap tables are accurate.
 */
export function securityStateAsOf(
  s: SecurityLike,
  asOf: Date,
  transactions?: TransactionLike[],
): { exists: boolean; status: string; exercised: number; cancelled: number } {
  const issued = toDate(s.issueDate);
  if (isAfter(issued, asOf)) return { exists: false, status: s.status, exercised: 0, cancelled: 0 };
  if (!transactions) {
    return { exists: true, status: s.status, exercised: s.exercisedQuantity ?? 0, cancelled: s.cancelledQuantity ?? 0 };
  }
  const txs = transactions.filter((t) => t.securityId === s.id);
  let exercised = 0;
  let cancelled = 0;
  let status = s.status;
  const laterTerminal = txs.some(
    (t) =>
      ["CANCELLATION", "REPURCHASE", "CONVERSION", "TRANSFER", "TERMINATION"].includes(t.type) &&
      isAfter(toDate(t.effectiveDate), asOf),
  );
  for (const t of txs) {
    if (isAfter(toDate(t.effectiveDate), asOf)) continue;
    if (t.type === "EXERCISE") exercised += t.quantity;
    if (t.type === "CANCELLATION" || t.type === "TERMINATION" || t.type === "REPURCHASE") cancelled += t.quantity;
  }
  if (laterTerminal && ["CANCELLED", "REPURCHASED", "CONVERTED", "TRANSFERRED", "FORFEITED", "EXPIRED"].includes(status)) {
    status = "OUTSTANDING";
  }
  // A grant exercised in full after `asOf` was still an open option on that date.
  const laterExercise = txs.some((t) => t.type === "EXERCISE" && isAfter(toDate(t.effectiveDate), asOf));
  if (laterExercise && status === "EXERCISED") status = "OUTSTANDING";
  if (txs.length === 0) {
    exercised = s.exercisedQuantity ?? 0;
    cancelled = s.cancelledQuantity ?? 0;
  }
  return { exists: true, status, exercised, cancelled };
}

export function isOutstandingStatus(status: string) {
  return status === "OUTSTANDING" || status === "EXERCISED" || status === "PENDING_SIGNATURE";
}

const GROUP_ORDER: { key: string; label: string; match: (r: string) => boolean }[] = [
  { key: "founders", label: "Founders", match: (r) => r === "FOUNDER" },
  { key: "investors", label: "Investors", match: (r) => r === "INVESTOR" },
  { key: "employees", label: "Employees", match: (r) => r === "EMPLOYEE" || r === "FORMER_EMPLOYEE" },
  { key: "advisors", label: "Advisors & consultants", match: (r) => r === "ADVISOR" || r === "CONSULTANT" || r === "BOARD_MEMBER" },
  { key: "other", label: "Other", match: () => true },
];

export function buildCapTable(input: CapTableInput): CapTableSummary {
  const asOf = input.asOf ?? new Date();
  const classes = new Map(input.shareClasses.map((c) => [c.id, c]));
  const stakeholders = new Map(input.stakeholders.map((s) => [s.id, s]));
  const rows = new Map<string, CapTableRow>();

  const rowFor = (stakeholderId: string): CapTableRow => {
    let row = rows.get(stakeholderId);
    if (!row) {
      const sh = stakeholders.get(stakeholderId);
      row = {
        stakeholderId,
        name: sh?.name ?? "Unknown",
        relationship: sh?.relationship ?? "OTHER",
        byClass: {},
        commonShares: 0,
        preferredShares: 0,
        optionsGranted: 0,
        optionsOutstanding: 0,
        optionsVested: 0,
        optionsExercisable: 0,
        rsus: 0,
        warrants: 0,
        safePrincipal: 0,
        notePrincipal: 0,
        invested: 0,
        outstandingShares: 0,
        outstandingPct: 0,
        fullyDilutedShares: 0,
        fullyDilutedPct: 0,
        votingPct: 0,
        securityIds: [],
      };
      rows.set(stakeholderId, row);
    }
    return row;
  };

  const classIssued = new Map<string, number>();
  const classPref = new Map<string, number>();
  const planGranted = new Map<string, number>();
  const planExercised = new Map<string, number>();
  const planCancelled = new Map<string, number>();
  let safeCount = 0;
  let safePrincipal = 0;
  let noteCount = 0;
  let notePrincipal = 0;
  let rsusTotal = 0;
  let warrantsTotal = 0;
  let optionsOutstandingTotal = 0;
  let optionsVestedTotal = 0;

  for (const s of input.securities) {
    const state = securityStateAsOf(s, asOf, input.transactions);
    if (!state.exists) continue;
    const sh = stakeholders.get(s.stakeholderId);
    const schedule = s.vestingScheduleId ? input.vestingSchedules?.[s.vestingScheduleId] : undefined;

    if (SHARE_TYPES.includes(s.type as never)) {
      if (!isOutstandingStatus(state.status)) continue;
      const cls = s.shareClassId ? classes.get(s.shareClassId) : undefined;
      const row = rowFor(s.stakeholderId);
      row.securityIds.push(s.id);
      const qty = s.quantity - state.cancelled;
      if (cls) {
        row.byClass[cls.id] = (row.byClass[cls.id] ?? 0) + qty;
        classIssued.set(cls.id, (classIssued.get(cls.id) ?? 0) + qty);
        if (cls.type === "PREFERRED") {
          row.preferredShares += qty * (cls.conversionRatio || 1);
          const oip = s.pricePerShare ?? cls.originalIssuePrice ?? 0;
          classPref.set(cls.id, (classPref.get(cls.id) ?? 0) + qty * oip * (cls.liquidationMultiple || 1));
        } else {
          row.commonShares += qty;
        }
      } else {
        row.commonShares += qty;
      }
      row.invested += (s.pricePerShare ?? 0) * qty;
      // Restricted stock issued from a plan consumes the pool like an exercised option.
      if (s.type === "RSA" && s.equityPlanId) {
        planExercised.set(s.equityPlanId, (planExercised.get(s.equityPlanId) ?? 0) + qty);
      }
      continue;
    }

    if (EXERCISABLE_TYPES.includes(s.type as never) || s.type === "RSU") {
      const row = rowFor(s.stakeholderId);
      row.securityIds.push(s.id);
      const unexercised = Math.max(0, s.quantity - state.exercised - state.cancelled);
      const live = isOutstandingStatus(state.status) && unexercised > 0;
      const vest = computeVesting(s.quantity, s.vestingStartDate ?? s.issueDate, schedule ?? null, {
        asOf,
        terminationDate: sh?.terminationDate ?? null,
        cancelled: state.cancelled,
        accelerated: accelerationOf(s),
      });
      if (s.type === "RSU") {
        if (live) {
          row.rsus += unexercised;
          rsusTotal += unexercised;
        }
        if (s.equityPlanId) {
          planGranted.set(s.equityPlanId, (planGranted.get(s.equityPlanId) ?? 0) + (live ? unexercised : 0));
          planExercised.set(s.equityPlanId, (planExercised.get(s.equityPlanId) ?? 0) + state.exercised);
          planCancelled.set(s.equityPlanId, (planCancelled.get(s.equityPlanId) ?? 0) + state.cancelled + vest.forfeited);
        }
        continue;
      }
      if (s.type === "WARRANT") {
        if (live) {
          row.warrants += unexercised;
          warrantsTotal += unexercised;
        }
        continue;
      }
      // options
      row.optionsGranted += s.quantity;
      if (s.equityPlanId) {
        planGranted.set(s.equityPlanId, (planGranted.get(s.equityPlanId) ?? 0) + (live ? unexercised : 0));
        planExercised.set(s.equityPlanId, (planExercised.get(s.equityPlanId) ?? 0) + state.exercised);
        planCancelled.set(s.equityPlanId, (planCancelled.get(s.equityPlanId) ?? 0) + state.cancelled + vest.forfeited);
      }
      if (live) {
        row.optionsOutstanding += unexercised;
        const vestedUnexercised = Math.max(0, Math.min(unexercised, vest.vested - state.exercised));
        row.optionsVested += vestedUnexercised;
        row.optionsExercisable += vestedUnexercised;
        optionsOutstandingTotal += unexercised;
        optionsVestedTotal += vestedUnexercised;
      }
      continue;
    }

    if (CONVERTIBLE_TYPES.includes(s.type as never)) {
      if (state.status !== "OUTSTANDING") continue;
      const row = rowFor(s.stakeholderId);
      row.securityIds.push(s.id);
      const principal = s.totalAmount ?? 0;
      row.invested += principal;
      if (s.type === "SAFE") {
        row.safePrincipal += principal;
        safeCount++;
        safePrincipal += principal;
      } else {
        row.notePrincipal += principal;
        noteCount++;
        notePrincipal += principal;
      }
    }
  }

  // Plans
  const plans: PlanSummary[] = input.equityPlans.map((p) => {
    const granted = planGranted.get(p.id) ?? 0;
    const exercised = planExercised.get(p.id) ?? 0;
    const available = Math.max(0, p.authorizedShares - granted - exercised);
    return {
      id: p.id,
      name: p.name,
      authorized: p.authorizedShares,
      granted,
      exercised,
      cancelled: planCancelled.get(p.id) ?? 0,
      available,
      utilizationPct: p.authorizedShares > 0 ? (granted + exercised) / p.authorizedShares : 0,
    };
  });
  const poolAvailable = plans.filter((p) => input.equityPlans.find((e) => e.id === p.id)?.status !== "TERMINATED").reduce((a, p) => a + p.available, 0);
  const poolAuthorized = plans.reduce((a, p) => a + p.authorized, 0);

  // Totals
  let commonOutstanding = 0;
  let preferredOutstanding = 0;
  for (const row of rows.values()) {
    row.outstandingShares = row.commonShares + row.preferredShares;
    row.fullyDilutedShares = row.outstandingShares + row.optionsOutstanding + row.rsus + row.warrants;
    commonOutstanding += row.commonShares;
    preferredOutstanding += row.preferredShares;
  }
  const outstandingShares = commonOutstanding + preferredOutstanding;
  const fullyDilutedShares = outstandingShares + optionsOutstandingTotal + rsusTotal + warrantsTotal + poolAvailable;

  let votingTotal = 0;
  const votingByRow = new Map<string, number>();
  for (const row of rows.values()) {
    let votes = 0;
    for (const [classId, qty] of Object.entries(row.byClass)) {
      const cls = classes.get(classId);
      votes += qty * (cls ? (cls.type === "PREFERRED" ? cls.conversionRatio : 1) : 1);
    }
    votingByRow.set(row.stakeholderId, votes);
    votingTotal += votes;
  }

  for (const row of rows.values()) {
    row.outstandingPct = outstandingShares > 0 ? row.outstandingShares / outstandingShares : 0;
    row.fullyDilutedPct = fullyDilutedShares > 0 ? row.fullyDilutedShares / fullyDilutedShares : 0;
    row.votingPct = votingTotal > 0 ? (votingByRow.get(row.stakeholderId) ?? 0) / votingTotal : 0;
  }

  const classTotals: ClassTotal[] = input.shareClasses
    .slice()
    .sort((a, b) => (a.type === b.type ? a.seniority - b.seniority : a.type === "PREFERRED" ? -1 : 1))
    .map((c) => {
      const issued = classIssued.get(c.id) ?? 0;
      const asConverted = c.type === "PREFERRED" ? issued * (c.conversionRatio || 1) : issued;
      const reserved = input.equityPlans.filter((p) => p.shareClassId === c.id).reduce((a, p) => a + p.authorizedShares, 0);
      return {
        shareClassId: c.id,
        name: c.name,
        prefix: c.prefix,
        type: c.type,
        authorized: c.authorizedShares,
        issued,
        asConverted,
        reservedForPlans: reserved,
        available: Math.max(0, c.authorizedShares - issued - reserved),
        outstandingPct: outstandingShares > 0 ? asConverted / outstandingShares : 0,
        fullyDilutedPct: fullyDilutedShares > 0 ? asConverted / fullyDilutedShares : 0,
        liquidationPreference: classPref.get(c.id) ?? 0,
      };
    });

  const sortedRows = [...rows.values()].sort((a, b) => b.fullyDilutedShares - a.fullyDilutedShares || a.name.localeCompare(b.name));

  const groups = GROUP_ORDER.map((g) => ({ key: g.key, label: g.label, fullyDilutedShares: 0, fullyDilutedPct: 0, holders: 0 }));
  for (const row of sortedRows) {
    const idx = GROUP_ORDER.findIndex((g) => g.match(row.relationship));
    const g = groups[idx === -1 ? groups.length - 1 : idx];
    g.fullyDilutedShares += row.fullyDilutedShares;
    g.holders += 1;
  }
  groups.push({ key: "pool", label: "Unallocated option pool", fullyDilutedShares: poolAvailable, fullyDilutedPct: 0, holders: 0 });
  for (const g of groups) g.fullyDilutedPct = fullyDilutedShares > 0 ? g.fullyDilutedShares / fullyDilutedShares : 0;

  return {
    asOf,
    rows: sortedRows,
    classTotals,
    plans,
    totals: {
      outstandingShares,
      fullyDilutedShares,
      commonOutstanding,
      preferredOutstanding,
      optionsOutstanding: optionsOutstandingTotal,
      optionsVested: optionsVestedTotal,
      rsus: rsusTotal,
      warrants: warrantsTotal,
      poolAvailable,
      poolAuthorized,
      safeCount,
      safePrincipal,
      noteCount,
      notePrincipal,
      totalInvested: sortedRows.reduce((a, r) => a + r.invested, 0),
      totalLiquidationPreference: [...classPref.values()].reduce((a, b) => a + b, 0),
      stakeholderCount: sortedRows.length,
    },
    groups: groups.filter((g) => g.fullyDilutedShares > 0 || g.key === "pool"),
  };
}

/** Next certificate number for a prefix, e.g. CS-12. */
export function nextCertificateNumber(prefix: string, existing: string[]) {
  let max = 0;
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  for (const c of existing) {
    const m = c.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${max + 1}`;
}
